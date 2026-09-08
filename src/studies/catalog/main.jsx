import React from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "@fungi.computer/caps/components/badge";
import { Button } from "@fungi.computer/caps/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@fungi.computer/caps/components/card";
import "@fungi.computer/caps/styles.css";
import { STUDY_GROUPS } from "../catalog.js";
import "../study-chrome.css";
import "./style.css";

function StudyCard({ study }) {
  return (
    <Card variant="outline" className="study-catalog-card">
      <CardHeader>
        <CardTitle>{study.title}</CardTitle>
        <Badge tone="neutral" size="sm">
          {study.evidence}
        </Badge>
      </CardHeader>
      <CardContent>
        <CardDescription>{study.scope}</CardDescription>
        {study.href ? (
          <Button asChild size="sm">
            <a href={study.href}>Open study</a>
          </Button>
        ) : (
          <Button size="sm" disabled>
            Recorded page pending
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function Catalog() {
  return (
    <section className="study-catalog" aria-labelledby="study-catalog-title">
      <header className="study-catalog-heading">
        <div>
          <p>Goblin Bed &amp; Breakfast · studies</p>
          <h1 id="study-catalog-title">Study catalog</h1>
          <span>
            Recorded evidence, interactive art, and isolated browser experiments
            are labelled by how they were produced.
          </span>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href="/">Back to the clearing</a>
        </Button>
      </header>
      {STUDY_GROUPS.map((group) => (
        <section
          className="study-catalog-group"
          id={group.id}
          key={group.id}
          aria-labelledby={`${group.id}-title`}
        >
          <h2 id={`${group.id}-title`}>{group.title}</h2>
          <div className="study-catalog-grid">
            {group.studies.map((study) => (
              <StudyCard key={study.id} study={study} />
            ))}
          </div>
        </section>
      ))}
    </section>
  );
}

createRoot(document.querySelector("#study-catalog")).render(<Catalog />);
