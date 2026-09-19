import Link from "next/link";
import type { Tool } from "@/lib/types";
import { FlowChips } from "./FormatChip";
import { Icon, toolIcon } from "./Icon";

export function ToolCard({ tool }: { tool: Tool }) {
  return (
    <Link href={`/tools/${tool.slug}`} className="card tool">
      <span className="tool-top">
        <span className="tool-ico"><Icon name={toolIcon(tool.slug, tool.cat)} size={18} /></span>
        <FlowChips from={tool.from} to={tool.to} size="sm" />
      </span>
      <b>{tool.name}</b>
      <span className="muted">{tool.short}</span>
      <Icon name="arrow" size={16} className="tool-go" />
    </Link>
  );
}
