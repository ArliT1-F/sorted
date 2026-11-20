"use client";
import { useRef, useState } from "react";

export function FileDrop({ onFiles, accept, multiple, title, sub }: { onFiles: (f: File[]) => void; accept?: string; multiple?: boolean; title: string; sub?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={over ? "drop over" : "drop"}
      role="button"
      tabIndex={0}
      onClick={() => ref.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), ref.current?.click())}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = Array.from(e.dataTransfer.files);
        if (f.length) onFiles(multiple ? f : f.slice(0, 1));
      }}
    >
      <strong>{title}</strong>
      <span className="muted">{sub ?? "Drop here or click to choose"}</span>
      <input
        ref={ref}
        type="file"
        hidden
        accept={accept}
        multiple={multiple}
        onChange={(e) => {
          const f = Array.from(e.target.files ?? []);
          if (f.length) onFiles(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function useToast() {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (m: string) => {
    setMsg(m);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMsg(null), 3000);
  };
  const node = msg ? <div className="toast" role="status">{msg}</div> : null;
  return { show, node };
}
