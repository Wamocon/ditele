/**
 * WS-0 owns everything in this folder. Import from here; never edit these files.
 * If a component lacks something you need, wrap it in your own feature folder
 * and file a row in plan/status/ISSUES.md.
 *
 * Tier 1 (Wave 0a) — shipped.
 * Tier 2/3 (Wave 0b) — announced in plan/status/WS-0.md as each one lands.
 */
export { cn } from "./cn";
export { Button, type ButtonProps } from "./button";
export { Card, CardTitle, CardDescription, type CardProps } from "./card";
export { Input, Textarea, Select, type InputProps, type TextareaProps, type SelectProps } from "./input";
export { Field, type FieldProps } from "./field";
export { Badge, type BadgeProps } from "./badge";
export { StatusBadge, statusLabel } from "./status-badge";
export { Skeleton, SkeletonText, SkeletonCard, EmptyState, ErrorState, DotMark } from "./states";
export { ConfirmDialog, type ConfirmDialogProps } from "./confirm-dialog";
export { DataTable, type Column, type DataTableProps } from "./data-table";

/* Tier 3 — surface + motion. Every one degrades to a correct static render
   with JavaScript off or `prefers-reduced-motion: reduce` set. */
export { useReducedMotion } from "./use-reduced-motion";
export { Spotlight, type SpotlightProps } from "./spotlight";
export { Reveal, type RevealProps } from "./reveal";
export { CountUp, type CountUpProps } from "./count-up";
export { StepList, SectionLabel, type Step, type StepState, type StepListProps } from "./step-list";
export { VideoEmbed, detectProvider, type VideoProvider } from "./video-embed";
