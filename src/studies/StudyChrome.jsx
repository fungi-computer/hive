import React from "react";
import { createRoot } from "react-dom/client";
import { Button } from "@fungi.computer/caps/components/button";
import { Badge } from "@fungi.computer/caps/components/badge";
import "@fungi.computer/caps/styles.css";
import { studyById } from "./catalog.js";
import "./study-chrome.css";

export function StudyChrome({ studyId }) {
  const study = studyById(studyId);
  return (
    <>
      <a className="study-skip" href="#study-content">
        Skip to study
      </a>
      <header className="study-chrome" aria-label="Study navigation">
        <nav className="study-crumbs" aria-label="Breadcrumb">
          <a href="/study">Studies</a>
          <span aria-hidden="true">/</span>
          <a href={`/study#${study.group.id}`}>{study.group.title}</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{study.title}</span>
        </nav>
        <div className="study-chrome-actions">
          <Badge tone="neutral" size="sm">
            {study.evidence}
          </Badge>
          <Button asChild variant="outline" size="sm">
            <a href="/">Back to the clearing</a>
          </Button>
        </div>
      </header>
    </>
  );
}

function mountStudyChrome() {
  const host = document.querySelector("[data-study-chrome]");
  if (!host || host.dataset.studyChromeMounted === "true") return;
  const studyId = host.dataset.studyId;
  if (!studyId) throw new Error("Study chrome requires data-study-id");
  host.dataset.studyChromeMounted = "true";
  createRoot(host).render(<StudyChrome studyId={studyId} />);
}

mountStudyChrome();
