"use client";

import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="top-right"
      toastOptions={{
        classNames: {
          toast: "bg-card border border-border text-card-foreground shadow-lg rounded-lg",
          title: "font-semibold",
          description: "text-muted-foreground",
        },
      }}
    />
  );
}

export { toast } from "sonner";
