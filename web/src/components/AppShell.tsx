import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ScopeProvider } from "../scope";
import { DesktopSidebar } from "./DesktopSidebar";
import { MobileTopBar } from "./MobileTopBar";
import { MobileBottomNav } from "./MobileBottomNav";
import { KeyboardShortcutsProvider } from "./KeyboardShortcutsProvider";
import {
  UploadProvider,
  UploadFAB,
  UploadDropZone,
  UploadProgressSheet,
} from "./Upload";

export function AppShell({ syncRunner }: { syncRunner?: ReactNode }) {
  return (
    <ScopeProvider>
      <Tooltip.Provider delayDuration={200}>
        <UploadProvider>
      <KeyboardShortcutsProvider>
        <div className="md:grid md:grid-cols-[auto_1fr] min-h-screen">
          <DesktopSidebar />
          <div className="flex flex-col min-w-0">
            <MobileTopBar />
            <main
              className="
                flex-1 min-w-0
                px-4 md:px-8 lg:px-10
                pt-4 md:pt-7
                pb-24 md:pb-16
              "
            >
              <div className="max-w-[1280px] mx-auto">
                <Outlet />
              </div>
            </main>
          </div>
        </div>
        <MobileBottomNav />
        <UploadFAB />
        <UploadDropZone />
        <UploadProgressSheet />
        {syncRunner}
      </KeyboardShortcutsProvider>
        </UploadProvider>
      </Tooltip.Provider>
    </ScopeProvider>
  );
}
