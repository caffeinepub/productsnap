import { motion } from "motion/react";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  labels: string[];
  onStepClick?: (index: number) => void;
}

export function StepIndicator({
  currentStep,
  totalSteps,
  labels,
  onStepClick,
}: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2 px-4 py-3">
      {Array.from({ length: totalSteps }, (_, i) => {
        const isClickable = onStepClick != null && i <= currentStep;
        return (
          <div
            key={labels[i] ?? `step-${i + 1}`}
            className="flex flex-col items-center gap-1"
          >
            <div className="relative flex items-center justify-center">
              <motion.div
                role={isClickable ? "button" : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onClick={isClickable ? () => onStepClick(i) : undefined}
                onKeyDown={
                  isClickable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onStepClick(i);
                        }
                      }
                    : undefined
                }
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-display font-700 transition-colors select-none ${
                  isClickable ? "cursor-pointer" : ""
                }`}
                animate={{
                  backgroundColor:
                    i < currentStep
                      ? "oklch(0.78 0.18 72)"
                      : i === currentStep
                        ? "oklch(0.78 0.18 72 / 0.15)"
                        : "oklch(0.22 0.025 245)",
                  borderColor:
                    i <= currentStep
                      ? "oklch(0.78 0.18 72)"
                      : "oklch(0.26 0.03 245)",
                  color:
                    i < currentStep
                      ? "oklch(0.15 0.02 72)"
                      : i === currentStep
                        ? "oklch(0.78 0.18 72)"
                        : "oklch(0.55 0.04 245)",
                }}
                style={{ border: "2px solid" }}
                transition={{ duration: 0.3 }}
              >
                {i < currentStep ? (
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    fill="none"
                    aria-label="Completed"
                    role="img"
                  >
                    <path
                      d="M2 6l3 3 5-5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </motion.div>
              {i === currentStep && (
                <motion.div
                  className="absolute inset-0 rounded-full pointer-events-none"
                  style={{ border: "2px solid oklch(0.78 0.18 72 / 0.4)" }}
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                />
              )}
            </div>
            {i === currentStep && (
              <motion.span
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[10px] font-body font-500 text-primary whitespace-nowrap"
              >
                {labels[i]}
              </motion.span>
            )}
          </div>
        );
      })}
    </div>
  );
}
