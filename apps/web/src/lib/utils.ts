export { cn } from "cn"

export type CardBevelSize = "default" | "sm" | "md" | "lg" ;

export const cardBevel = (size: CardBevelSize) => {
    switch (size) {
        case "default":
            return "shadow-[inset_0_1px_1px_rgb(255_255_255/0.28),inset_0_-1px_1px_rgb(0_0_0/0.08),inset_1px_0_1px_rgb(255_255_255/0.12),inset_-1px_0_1px_rgb(0_0_0/0.05)] dark:shadow-[inset_0_1px_1px_rgb(255_255_255/0.08),inset_0_-1px_1px_rgb(0_0_0/0.22),inset_1px_0_1px_rgb(255_255_255/0.04),inset_-1px_0_1px_rgb(0_0_0/0.16)]";
        case "sm":
            return "shadow-[inset_0_1px_1px_rgb(255_255_255/0.1),inset_0_-1px_1px_rgb(0_0_0/0.28),inset_1px_0_1px_rgb(255_255_255/0.05),inset_-1px_0_1px_rgb(0_0_0/0.2)]";
        case "md":
            return "shadow-[inset_0_1px_1px_rgb(255_255_255/0.15),inset_0_-1px_1px_rgb(0_0_0/0.35),inset_1px_0_1px_rgb(255_255_255/0.075),inset_-1px_0_1px_rgb(0_0_0/0.25)]";
        case "lg":
            return "shadow-[inset_0_1px_1px_rgb(255_255_255/0.2),inset_0_-1px_1px_rgb(0_0_0/0.4),inset_1px_0_1px_rgb(255_255_255/0.1),inset_-1px_0_1px_rgb(0_0_0/0.3)]";
    }
};