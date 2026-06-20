"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./instructions-viewer.module.css";

type InstructionsViewerProps = {
  assetBasePath: string;
  markdown: string;
};

export function InstructionsViewer({ assetBasePath, markdown }: InstructionsViewerProps) {
  return (
    <div className={styles.content}>
      <ReactMarkdown
        components={{
          a({ children, href, ...props }) {
            return (
              <a href={resolveAssetPath(href, assetBasePath)} rel="noreferrer" target="_blank" {...props}>
                {children}
              </a>
            );
          },
          img({ alt, src, ...props }) {
            return (
              <img
                alt={typeof alt === "string" ? alt : ""}
                src={resolveAssetPath(typeof src === "string" ? src : undefined, assetBasePath)}
                {...props}
              />
            );
          },
          table({ children, ...props }) {
            return (
              <div className={styles.tableWrap}>
                <table {...props}>{children}</table>
              </div>
            );
          }
        }}
        remarkPlugins={[remarkGfm]}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

function resolveAssetPath(value: string | undefined, assetBasePath: string) {
  if (!value || isAbsoluteUrl(value) || value.startsWith("#") || value.startsWith("data:")) {
    return value;
  }

  const normalized = value.replace(/^\.\//, "");
  return `${assetBasePath}/${normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function isAbsoluteUrl(value: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//");
}
