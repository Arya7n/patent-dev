"use client";

import { ProjectNav } from "@/components/shell";
import { use } from "react";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return (
    <div>
      <ProjectNav projectId={projectId} />
      {children}
    </div>
  );
}
