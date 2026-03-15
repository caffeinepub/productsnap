import Int "mo:core/Int";
import Time "mo:core/Time";
import Map "mo:core/Map";
import List "mo:core/List";
import Order "mo:core/Order";
import Nat "mo:core/Nat";
import Array "mo:core/Array";
import Runtime "mo:core/Runtime";
import OutCall "http-outcalls/outcall";
import MixinStorage "blob-storage/Mixin";

actor {
  include MixinStorage();

  type ProductEntry = {
    id : Nat;
    sku : Text;
    productName : Text;
    capturedImageUrls : Text;
    searchImageUrls : Text;
    createdAt : Int;
  };

  module ProductEntry {
    public func compareByCreatedAt(entry1 : ProductEntry, entry2 : ProductEntry) : Order.Order {
      Int.compare(entry1.createdAt, entry2.createdAt);
    };
  };

  var nextId = 0;
  let productEntries = Map.empty<Nat, ProductEntry>();

  // Cloudflare Images configuration
  var cloudflareAccountId : Text = "";
  var cloudflareApiToken : Text = "";

  func textToBytes(t : Text) : [Nat8] {
    t.encodeUtf8().toArray();
  };

  func concatBytes(a : [Nat8], b : [Nat8]) : [Nat8] {
    Array.tabulate<Nat8>(a.size() + b.size(), func(i) {
      if (i < a.size()) a[i] else b[i - a.size()];
    });
  };

  public shared ({ caller }) func setCloudflareConfig(accountId : Text, apiToken : Text) : async () {
    cloudflareAccountId := accountId;
    cloudflareApiToken := apiToken;
  };

  public query ({ caller }) func getCloudflareConfigured() : async Bool {
    cloudflareAccountId != "" and cloudflareApiToken != "";
  };

  public shared ({ caller }) func uploadImageToCloudflare(imageData : [Nat8]) : async Text {
    if (cloudflareAccountId == "" or cloudflareApiToken == "") {
      Runtime.trap("Cloudflare not configured. Please set your Account ID and API Token in Settings.");
    };

    let boundary = "FormBoundaryProductSnap";

    let headerPart = textToBytes(
      "--" # boundary # "\r\n" #
      "Content-Disposition: form-data; name=\"file\"; filename=\"product.avif\"\r\n" #
      "Content-Type: image/avif\r\n\r\n"
    );

    let footerPart = textToBytes("\r\n--" # boundary # "--\r\n");

    let bodyBytes = concatBytes(concatBytes(headerPart, imageData), footerPart);

    let url = "https://api.cloudflare.com/client/v4/accounts/" # cloudflareAccountId # "/images/v1";

    await OutCall.httpPostBinaryRequest(
      url,
      [
        { name = "Authorization"; value = "Bearer " # cloudflareApiToken },
        { name = "Content-Type"; value = "multipart/form-data; boundary=" # boundary },
      ],
      bodyBytes,
      transform,
    );
  };

  public shared ({ caller }) func createEntry(sku : Text, productName : Text, capturedImageUrls : Text, searchImageUrls : Text) : async ProductEntry {
    let id = nextId;
    nextId += 1;

    let entry : ProductEntry = {
      id;
      sku;
      productName;
      capturedImageUrls;
      searchImageUrls;
      createdAt = Time.now();
    };

    productEntries.add(id, entry);
    entry;
  };

  public shared ({ caller }) func updateEntry(id : Nat, sku : Text, productName : Text, capturedImageUrls : Text, searchImageUrls : Text) : async ProductEntry {
    switch (productEntries.get(id)) {
      case (null) { Runtime.trap("Product entry does not exist.") };
      case (?existingEntry) {
        let updatedEntry : ProductEntry = {
          existingEntry with
          sku;
          productName;
          capturedImageUrls;
          searchImageUrls;
        };
        productEntries.add(id, updatedEntry);
        updatedEntry;
      };
    };
  };

  public query ({ caller }) func getEntry(id : Nat) : async ProductEntry {
    switch (productEntries.get(id)) {
      case (null) { Runtime.trap("Product entry does not exist.") };
      case (?entry) { entry };
    };
  };

  public query ({ caller }) func getAllEntries() : async [ProductEntry] {
    productEntries.values().toArray();
  };

  public shared ({ caller }) func deleteEntry(id : Nat) : async () {
    if (not productEntries.containsKey(id)) {
      Runtime.trap("Product entry does not exist.");
    };
    productEntries.remove(id);
  };

  public query ({ caller }) func getEntriesByDateRange(fromTimestamp : Int, toTimestamp : Int) : async [ProductEntry] {
    let filteredEntries = List.empty<ProductEntry>();

    for (entry in productEntries.values()) {
      if (entry.createdAt >= fromTimestamp and entry.createdAt <= toTimestamp) {
        filteredEntries.add(entry);
      };
    };

    filteredEntries.toArray().sort(ProductEntry.compareByCreatedAt);
  };

  public shared ({ caller }) func searchImages(searchQuery : Text) : async Text {
    let url = "https://api.openverse.org/v1/images/?q=" # searchQuery # "&page_size=18";
    await OutCall.httpGetRequest(url, [], transform);
  };

  public query ({ caller }) func transform(input : OutCall.TransformationInput) : async OutCall.TransformationOutput {
    OutCall.transform(input);
  };
};
