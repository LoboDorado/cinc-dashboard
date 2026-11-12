"use client";

import { useId, type ReactNode } from "react";
import { Tabs, TabPanel, useTabParam } from "@/components/ui/tabs";
import { NodeComplianceTab } from "@/components/compliance/node-compliance-tab";

const TAB_IDS = ["details", "compliance"] as const;

/**
 * Wraps a node's existing detail content (the unchanged ObjectEditor output)
 * and the new Compliance tab in a shared tab bar. `detailsPanel` is passed
 * through untouched -- ObjectEditor's own header/back-link/Save/Delete
 * buttons render exactly as before, just now inside the "Details" panel.
 */
export function NodeDetailTabs({
  detailsPanel,
  hasCollector,
  server,
  org,
  nodeName,
}: {
  detailsPanel: ReactNode;
  hasCollector: boolean;
  server: string;
  org: string;
  nodeName: string;
}) {
  const id = useId();
  const [activeId, setActiveId] = useTabParam("tab", "details", TAB_IDS);

  return (
    <div className="space-y-4">
      <Tabs
        id={id}
        label="Node sections"
        activeId={activeId}
        onChange={setActiveId}
        tabs={[
          { id: "details", label: "Details" },
          { id: "compliance", label: "Compliance" },
        ]}
      />
      <TabPanel id={id} tabId="details" activeId={activeId}>
        {detailsPanel}
      </TabPanel>
      <TabPanel id={id} tabId="compliance" activeId={activeId}>
        <NodeComplianceTab
          active={activeId === "compliance"}
          hasCollector={hasCollector}
          server={server}
          org={org}
          nodeName={nodeName}
        />
      </TabPanel>
    </div>
  );
}
