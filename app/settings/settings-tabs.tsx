"use client";

import { useRef, useState } from "react";
import { SettingsForm, type SettingsFormHandle } from "./settings-form";
import { CloudSettingsForm, type CloudSettingsFormHandle } from "./cloud-settings-form";
import { Button } from "@/components/ui/button";
import type { GlobalSettingsShape } from "@/lib/settings";

type Tab = "general" | "local" | "cloud";

export function SettingsTabs({ initial }: { initial: GlobalSettingsShape }) {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const localFormRef = useRef<SettingsFormHandle>(null);
  const cloudFormRef = useRef<CloudSettingsFormHandle>(null);

  const tabs: { id: Tab; label: string }[] = [
    { id: "general", label: "General" },
    { id: "local", label: "Local" },
    { id: "cloud", label: "Cloud" },
  ];

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setSaveError(null);

    const [localResult, cloudResult] = await Promise.all([
      localFormRef.current?.save() ?? { ok: true },
      cloudFormRef.current?.save() ?? { ok: true },
    ]);

    setSaving(false);

    const failed = [localResult, cloudResult].find((r) => !r.ok);
    if (failed) {
      setSaveError(failed.error ?? "Save failed");
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tab bar */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — always mounted so state is preserved across tab switches */}
      {/* Single SettingsForm instance: section prop controls which fields are visible */}
      <div className={activeTab === "cloud" ? "hidden" : ""}>
        <SettingsForm
          ref={localFormRef}
          initial={initial}
          section={activeTab !== "cloud" ? activeTab : "general"}
          onDirty={() => setSaved(false)}
        />
      </div>
      <div className={activeTab === "cloud" ? "" : "hidden"}>
        <CloudSettingsForm ref={cloudFormRef} />
      </div>

      {/* Unified save button — visible on all tabs */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          disabled={saving}
          data-testid="settings-save-button"
        >
          {saving ? "Saving…" : "Save settings"}
        </Button>
        {saved && (
          <span data-testid="settings-saved-indicator" className="text-sm text-green-500">
            Saved.
          </span>
        )}
        {saveError && (
          <span role="alert" data-testid="settings-error" className="text-sm text-destructive">
            {saveError}
          </span>
        )}
      </div>
    </div>
  );
}
