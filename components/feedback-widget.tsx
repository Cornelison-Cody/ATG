"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, MessageSquareWarning, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./feedback-widget.module.css";

type FeedbackMode = "edit" | "review";

type FeedbackResult = {
  issueNumber: number;
  issueUrl: string;
};

type FeedbackIssueType = "Bug" | "Task";

export function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [issueType, setIssueType] = useState<FeedbackIssueType>("Bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [mode, setMode] = useState<FeedbackMode>("edit");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const canReview = useMemo(
    () => title.trim().length > 0 && body.trim().length > 0 && !isSubmitting,
    [body, isSubmitting, title]
  );

  function open() {
    setIsOpen(true);
    setMode("edit");
    setMessage("");
    setResult(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  function close() {
    if (isSubmitting) {
      return;
    }
    setIsOpen(false);
    setIssueType("Bug");
    setTitle("");
    setBody("");
    setMode("edit");
    setMessage("");
    setResult(null);
  }

  async function submit() {
    if (!canReview || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    setMessage("");
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("issueType", issueType);
      formData.append("title", title);
      formData.append("body", body);
      formData.append("idempotencyKey", idempotencyKey);
      formData.append("context", JSON.stringify({
        appVersion: "0.1.0",
        projectId: currentProjectId(),
        submittedAt: new Date().toISOString(),
        url: window.location.href,
        userAgent: navigator.userAgent,
        view: currentView()
      }));
      const response = await fetch("/api/feedback", {
        body: formData,
        method: "POST"
      });
      const data = (await response.json()) as FeedbackResult & { error?: string };
      if (!response.ok || !data.issueNumber) {
        throw new Error(data.error || `Feedback submission failed (${response.status})`);
      }
      setResult({ issueNumber: data.issueNumber, issueUrl: data.issueUrl });
      setMessage("Feedback submitted.");
      setMode("review");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit feedback.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button className={styles.launcher} onClick={open} type="button">
        <MessageSquareWarning aria-hidden="true" />
        <span>Feedback</span>
      </button>
      {isOpen ? (
        <div className={styles.overlay} role="presentation">
          <section aria-labelledby="feedback-title" className={styles.modal}>
            <div className={styles.header}>
              <h2 id="feedback-title">Submit Feedback</h2>
              <button
                aria-label="Close feedback form"
                className={styles.closeButton}
                disabled={isSubmitting}
                onClick={close}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>
            <div className={styles.toolbar} role="tablist" aria-label="Feedback flow">
              <button
                aria-selected={mode === "edit"}
                className={mode === "edit" ? styles.activeModeButton : undefined}
                disabled={isSubmitting}
                onClick={() => setMode("edit")}
                role="tab"
                type="button"
              >
                Edit
              </button>
              <button
                aria-selected={mode === "review"}
                className={mode === "review" ? styles.activeModeButton : undefined}
                disabled={!canReview || isSubmitting}
                onClick={() => setMode("review")}
                role="tab"
                type="button"
              >
                Review
              </button>
            </div>
            <div className={styles.body}>
              {result ? (
                <div className={styles.success} role="status">
                  <CheckCircle2 aria-hidden="true" />
                  <div>
                    <strong>#{result.issueNumber}</strong>
                    <a href={result.issueUrl} rel="noreferrer" target="_blank">
                      Open in GitHub
                    </a>
                  </div>
                </div>
              ) : null}
              {mode === "edit" ? (
                <>
                  <fieldset className={styles.issueTypeField} disabled={isSubmitting}>
                    <legend>Type</legend>
                    <div>
                      <button
                        aria-pressed={issueType === "Bug"}
                        className={issueType === "Bug" ? styles.activeIssueType : undefined}
                        onClick={() => setIssueType("Bug")}
                        type="button"
                      >
                        Bug
                      </button>
                      <button
                        aria-pressed={issueType === "Task"}
                        className={issueType === "Task" ? styles.activeIssueType : undefined}
                        onClick={() => setIssueType("Task")}
                        type="button"
                      >
                        Task
                      </button>
                    </div>
                  </fieldset>
                  <label htmlFor="feedback-summary">Summary</label>
                  <input
                    autoComplete="off"
                    disabled={isSubmitting}
                    id="feedback-summary"
                    maxLength={140}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="What should we fix or improve?"
                    type="text"
                    value={title}
                  />
                  <label htmlFor="feedback-details">Details</label>
                  <textarea
                    disabled={isSubmitting}
                    id="feedback-details"
                    onChange={(event) => setBody(event.target.value)}
                    placeholder={"Use Markdown for headings, lists, links, **bold text**, and `code`."}
                    rows={10}
                    value={body}
                  />
                </>
              ) : (
                <div className={styles.review}>
                  <section aria-label="Feedback type">
                    <span>Type</span>
                    <strong>{issueType}</strong>
                  </section>
                  <section aria-label="Feedback summary">
                    <span>Summary</span>
                    <strong>{title.trim()}</strong>
                  </section>
                  <section aria-label="Feedback preview">
                    <span>Preview</span>
                    <div className={styles.preview}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
                    </div>
                  </section>
                </div>
              )}
              {message ? <p className={result ? styles.message : styles.error}>{message}</p> : null}
            </div>
            <div className={styles.footer}>
              <button className={styles.secondaryButton} disabled={isSubmitting} onClick={close} type="button">
                Close
              </button>
              {mode === "edit" ? (
                <button disabled={!canReview || isSubmitting} onClick={() => setMode("review")} type="button">
                  Review
                </button>
              ) : (
                <button disabled={!canReview || isSubmitting || Boolean(result)} onClick={submit} type="button">
                  {isSubmitting ? "Submitting" : "Submit"}
                </button>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function currentProjectId() {
  const pathname = window.location.pathname;
  const projectMatch = pathname.match(/^\/(?:tv|join)\/([^/?#]+)/);
  if (projectMatch) {
    return projectMatch[1];
  }
  return new URLSearchParams(window.location.search).get("project") || "";
}

function currentView() {
  const pathname = window.location.pathname;
  if (pathname.startsWith("/tv/")) return "tv";
  if (pathname.startsWith("/join/")) return "phone";
  if (pathname === "/dashboard") return currentProjectId() ? "project-editor" : "dashboard";
  return pathname || "app";
}
