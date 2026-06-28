import type { LucideProps } from "lucide-react";
import type { JSX } from "react";
import * as Lucide from "lucide-react";

type Icon = (props: LucideProps) => JSX.Element;

const asIcon = (component: Lucide.LucideIcon): Icon => component as unknown as Icon;

export const Activity = asIcon(Lucide.Activity);
export const Bell = asIcon(Lucide.Bell);
export const Box = asIcon(Lucide.Box);
export const Check = asIcon(Lucide.Check);
export const ChevronRight = asIcon(Lucide.ChevronRight);
export const CircleDot = asIcon(Lucide.CircleDot);
export const Clock3 = asIcon(Lucide.Clock3);
export const Code2 = asIcon(Lucide.Code2);
export const Eye = asIcon(Lucide.Eye);
export const FolderOpen = asIcon(Lucide.FolderOpen);
export const GitBranch = asIcon(Lucide.GitBranch);
export const Github = asIcon(Lucide.Github);
export const ListTree = asIcon(Lucide.ListTree);
export const LoaderCircle = asIcon(Lucide.LoaderCircle);
export const LockKeyhole = asIcon(Lucide.LockKeyhole);
export const Menu = asIcon(Lucide.Menu);
export const Network = asIcon(Lucide.Network);
export const Pause = asIcon(Lucide.Pause);
export const ScanLine = asIcon(Lucide.ScanLine);
export const ShieldCheck = asIcon(Lucide.ShieldCheck);
export const Sparkles = asIcon(Lucide.Sparkles);
export const X = asIcon(Lucide.X);
