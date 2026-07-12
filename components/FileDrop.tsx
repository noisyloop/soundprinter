"use client";

import { useRef, useState } from "react";

interface Props {
  label: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}

/** Click-or-drag audio file input. Files are processed 100% client-side. */
export default function FileDrop({ label, multiple = false, onFiles }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [drag, setDrag] = useState(false);

  const accept = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  };

  return (
    <div
      className={`dropzone${drag ? " drag" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        accept(e.dataTransfer.files);
      }}
    >
      {label}
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        multiple={multiple}
        hidden
        onChange={(e) => {
          accept(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
