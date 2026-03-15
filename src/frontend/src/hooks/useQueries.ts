import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProductEntry } from "../backend.d";
import { useActor } from "./useActor";

export function useGetAllEntries() {
  const { actor, isFetching } = useActor();
  return useQuery<ProductEntry[]>({
    queryKey: ["entries"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getAllEntries();
    },
    enabled: !!actor && !isFetching,
  });
}

export function useGetEntriesByDateRange(
  from: bigint,
  to: bigint,
  enabled: boolean,
) {
  const { actor, isFetching } = useActor();
  return useQuery<ProductEntry[]>({
    queryKey: ["entries", from.toString(), to.toString()],
    queryFn: async () => {
      if (!actor) return [];
      return actor.getEntriesByDateRange(from, to);
    },
    enabled: !!actor && !isFetching && enabled,
  });
}

export function useCreateEntry() {
  const { actor } = useActor();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      sku: string;
      productName: string;
      capturedImageUrls: string;
      searchImageUrls: string;
    }) => {
      if (!actor) throw new Error("Actor not available");
      return actor.createEntry(
        data.sku,
        data.productName,
        data.capturedImageUrls,
        data.searchImageUrls,
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entries"] });
    },
  });
}

export function useSearchImages(query: string, enabled: boolean) {
  const { actor, isFetching } = useActor();
  return useQuery<string>({
    queryKey: ["search", query],
    queryFn: async () => {
      if (!actor) return "[]";
      return actor.searchImages(query);
    },
    enabled: !!actor && !isFetching && enabled && query.trim().length > 0,
  });
}
