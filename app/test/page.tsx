"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { OptionCard } from "@/components/ui/OptionCard";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { BackButton, Screen, Wordmark } from "@/components/ui/Screen";
import { QUESTIONS, TOTAL_QUESTIONS, isStepComplete } from "@/lib/questions";
import { buildFootProfile } from "@/lib/engine/recommendation";
import { useSession } from "@/lib/session/SessionProvider";
import type { TestAnswers } from "@/lib/engine/types";

export default function TestPage() {
  const router = useRouter();
  const { testAnswers, setAnswer, commitProfile } = useSession();
  const [index, setIndex] = useState(0);

  const question = QUESTIONS[index];
  const raw = testAnswers[question.id];
  const current: string[] = Array.isArray(raw)
    ? (raw as string[])
    : typeof raw === "string"
      ? [raw]
      : [];

  const complete = isStepComplete(question, raw);
  const isLast = index === QUESTIONS.length - 1;

  function choose(value: string) {
    if (question.kind === "single") {
      setAnswer(question.id, value as never);
      // gentle auto-advance on single-choice
      window.setTimeout(() => advance(value), 220);
      return;
    }
    // multi
    let next: string[];
    if (question.id === "features" || question.id === "discomfort") {
      if (value === "none") {
        next = current.includes("none") ? [] : ["none"];
      } else {
        next = current.filter((v) => v !== "none");
        next = next.includes(value)
          ? next.filter((v) => v !== value)
          : [...next, value];
      }
    } else {
      next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
    }
    setAnswer(question.id, next as never);
  }

  function advance(justChosen?: string) {
    if (!isLast) {
      setIndex((i) => i + 1);
      return;
    }
    // Build the profile from the full answer set.
    const answers = {
      ...testAnswers,
      [question.id]: justChosen ?? raw,
    } as TestAnswers;
    commitProfile(buildFootProfile(answers));
    router.push("/perfil");
  }

  return (
    <>
      <div className="mx-auto flex h-16 w-full max-w-[520px] items-center px-5">
        <Wordmark />
      </div>
      <Screen>
        <BackButton fallback="/" />
        <ProgressBar
          value={(index + (complete ? 1 : 0)) / TOTAL_QUESTIONS}
          label={`Pregunta ${index + 1} de ${TOTAL_QUESTIONS}`}
        />

        <h1 className="text-2xl font-bold" key={question.id}>
          {question.title}
        </h1>
        {question.help ? (
          <p className="mt-2 text-base text-[var(--color-muted)]">
            {question.help}
          </p>
        ) : null}

        <div className="mt-6 flex flex-col gap-3">
          {question.options.map((opt) => (
            <OptionCard
              key={opt.value}
              label={opt.label}
              icon={opt.icon}
              multi={question.kind === "multi"}
              selected={current.includes(opt.value)}
              onClick={() => choose(opt.value)}
            />
          ))}
        </div>

        <div className="mt-8 flex items-center justify-between gap-3">
          {index > 0 ? (
            <Button variant="ghost" onClick={() => setIndex((i) => i - 1)}>
              Anterior
            </Button>
          ) : (
            <span />
          )}
          <Button onClick={() => advance()} disabled={!complete}>
            {isLast ? "Ver mi perfil" : "Siguiente"}
          </Button>
        </div>
      </Screen>
    </>
  );
}
