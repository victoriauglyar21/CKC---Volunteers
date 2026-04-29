import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import type { ProfileRecord } from "../authedApp/types";
import TrainingAdminManager from "./TrainingAdminManager";
import {
  PRIMARY_TRAINING_COURSE_ID,
  TRAINING_COURSES,
  TRAINING_PASSING_SCORE,
  type TrainingCourse as TrainingCourseItem,
  type TrainingQuestion,
} from "../authedApp/trainingCourseContent";
import {
  fetchTrainingCourses,
  saveTrainingCourseCompletion,
} from "../authedApp/services/trainingCourseService";

type TrainingCourseProps = {
  userId: string;
  profile: ProfileRecord | null;
  onClose: () => void;
  onCompleted: (changes: Partial<ProfileRecord>) => void;
};

type QuizResult = {
  score: number;
  correctCount: number;
  passed: boolean;
};

function formatCompletionDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getQuizResult(
  answers: Record<string, string>,
  questions: TrainingQuestion[],
): QuizResult {
  const correctCount = questions.filter(
    (question) => answers[question.id] === question.correctOptionId,
  ).length;
  const score = Math.round((correctCount / questions.length) * 100);
  return {
    score,
    correctCount,
    passed: score >= TRAINING_PASSING_SCORE,
  };
}

function getDashboardLabel(role: ProfileRecord["role"] | null | undefined) {
  if (role === "Lead" || role === "Admin") {
    return "Lead Training";
  }
  return "Volunteer Training";
}

function getCourseStatus(course: TrainingCourseItem, profile: ProfileRecord | null) {
  if (course.id === PRIMARY_TRAINING_COURSE_ID && profile?.training_completed) {
    return "Completed";
  }
  if (course.statusLabel) {
    return course.statusLabel;
  }
  return "Assigned";
}

export default function TrainingCourse({
  userId,
  profile,
  onClose,
  onCompleted,
}: TrainingCourseProps) {
  const [courses, setCourses] = useState<TrainingCourseItem[]>(TRAINING_COURSES);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [coursesMessage, setCoursesMessage] = useState("");
  const [showAdminManager, setShowAdminManager] = useState(false);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const detailTopRef = useRef<HTMLDivElement | null>(null);
  const visibleCourses = useMemo(() => {
    if (profile?.role === "Admin") {
      return courses;
    }
    if (profile?.role === "Lead") {
      return courses.filter(
        (course) =>
          (course.audience.includes("regular") || course.audience.includes("lead")) &&
          course.isPublished !== false,
      );
    }
    return courses.filter((course) => course.audience.includes("regular") && course.isPublished !== false);
  }, [courses, profile?.role]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    visibleCourses[0]?.id ?? PRIMARY_TRAINING_COURSE_ID,
  );
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<QuizResult | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadCourses = async () => {
      setCoursesLoading(true);
      const result = await fetchTrainingCourses();
      if (!mounted) return;
      if (result.error) {
        setCourses(TRAINING_COURSES);
        setCoursesMessage("Using local training course content until Supabase training tables are available.");
        setCoursesLoading(false);
        return;
      }
      if (result.data.length > 0) {
        setCourses(result.data);
      }
      setCoursesLoading(false);
    };
    void loadCourses();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (visibleCourses.some((course) => course.id === selectedCourseId)) return;
    setSelectedCourseId(visibleCourses[0]?.id ?? PRIMARY_TRAINING_COURSE_ID);
  }, [visibleCourses, selectedCourseId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mediaQuery = window.matchMedia("(max-width: 720px)");
    const applyMatch = () => {
      setIsMobileLayout(mediaQuery.matches);
    };
    applyMatch();
    const listener = () => applyMatch();
    mediaQuery.addEventListener("change", listener);
    return () => {
      mediaQuery.removeEventListener("change", listener);
    };
  }, []);

  useEffect(() => {
    setAnswers({});
    setMessage("");
    setResult(null);
  }, [selectedCourseId]);

  const selectedCourse =
    visibleCourses.find((course) => course.id === selectedCourseId) ?? visibleCourses[0] ?? courses[0] ?? TRAINING_COURSES[0];
  const dashboardLabel = getDashboardLabel(profile?.role);
  const alreadyCompleted =
    selectedCourse.id === PRIMARY_TRAINING_COURSE_ID && Boolean(profile?.training_completed);
  const completionDateLabel = formatCompletionDate(profile?.training_completed_at);
  const answeredCount = useMemo(
    () => Object.keys(answers).filter((id) => Boolean(answers[id])).length,
    [answers],
  );
  const hasQuiz = Boolean(selectedCourse.questions?.length);

  const handleAnswerChange = (questionId: string, optionId: string) => {
    setAnswers((previous) => ({ ...previous, [questionId]: optionId }));
    setMessage("");
  };

  const handleCourseSelect = (courseId: string) => {
    setSelectedCourseId(courseId);
    if (isMobileLayout) {
      window.setTimeout(() => {
        detailTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 30);
    }
  };

  const handleSubmit = async () => {
    if (!selectedCourse.questions?.length) {
      setMessage("This course structure is ready, but the quiz has not been added yet.");
      return;
    }
    if (!selectedCourse.dbId) {
      setMessage("This course needs to be saved in Supabase before completion can be tracked.");
      return;
    }
    if (answeredCount !== selectedCourse.questions.length) {
      setMessage("Please answer every question before submitting.");
      return;
    }

    const nextResult = getQuizResult(answers, selectedCourse.questions);
    setResult(nextResult);

    if (!nextResult.passed) {
      setMessage(`You need ${TRAINING_PASSING_SCORE}% to pass. Review the lessons and try again.`);
      return;
    }

    if (alreadyCompleted && selectedCourse.id === PRIMARY_TRAINING_COURSE_ID) {
      setMessage("Quiz passed. Training was already marked complete.");
      return;
    }

    setSaving(true);
    setMessage("");
    const completionResult = await saveTrainingCourseCompletion({
      userId,
      courseDbId: selectedCourse.dbId,
      score: nextResult.score,
    });
    if (completionResult.error) {
      setMessage(completionResult.error);
      setSaving(false);
      return;
    }

    if (selectedCourse.id === PRIMARY_TRAINING_COURSE_ID) {
      const completedAt = new Date().toISOString();
      const { data, error } = await supabase
        .from("profiles")
        .update({
          training_completed: true,
          training_completed_at: completedAt,
        })
        .eq("id", userId)
        .select("training_completed, training_completed_at")
        .single();

      if (error) {
        setMessage(error.message || "Quiz passed, but saving profile completion failed.");
        setSaving(false);
        return;
      }

      onCompleted({
        training_completed: data?.training_completed ?? true,
        training_completed_at: data?.training_completed_at ?? completedAt,
      });
    }

    setMessage("Quiz passed. Course completion saved.");
    setSaving(false);
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="modal-panel account-panel training-panel">
        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Training</p>
            <h3 className="modal-title">Training Courses</h3>
            <p className="modal-location">{dashboardLabel}</p>
          </div>
          <div className="modal-header-actions">
            {profile?.role === "Admin" ? (
              <button className="account-button" type="button" onClick={() => setShowAdminManager(true)}>
                Manage courses
              </button>
            ) : null}
            <button className="modal-close" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="modal-body training-body">
          <section className="training-dashboard-grid">
            {!isMobileLayout ? (
            <aside className="training-sidebar">
              <div className="training-section-heading">
                <div>
                  <p className="account-section-title">Courses Assigned To You</p>
                  <p className="training-list-description">
                    Open any course to view the lessons, videos, and quiz.
                  </p>
                </div>
                <span className="training-progress-chip">{visibleCourses.length} total</span>
              </div>
              {coursesMessage ? <div className="loading-banner">{coursesMessage}</div> : null}
              {coursesLoading ? <div className="loading-banner">Loading courses...</div> : null}
              <div className="training-course-list">
                {visibleCourses.map((course) => {
                  const isActive = course.id === selectedCourse.id;
                  return (
                    <button
                      key={course.id}
                      className={`training-course-nav ${isActive ? "active" : ""}`}
                      type="button"
                      onClick={() => handleCourseSelect(course.id)}
                    >
                      <div className="training-course-nav-head">
                        <span className="training-course-nav-title">{course.title}</span>
                        <span className={`training-course-nav-status ${getCourseStatus(course, profile).toLowerCase().replace(/\s+/g, "-")}`}>
                          {getCourseStatus(course, profile)}
                        </span>
                      </div>
                      <p className="training-course-nav-description">{course.description}</p>
                      <span className="training-course-nav-meta">
                        {course.estimatedTime} · {course.isRequired ? "Required" : "Optional"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>
            ) : null}

            <div className="training-detail">
              <div ref={detailTopRef} />
              {isMobileLayout ? (
                <div className="training-mobile-picker">
                  <label className="form-field">
                    <span className="form-label">Course</span>
                    <select
                      className="form-input training-mobile-select"
                      value={selectedCourse.id}
                      onChange={(event) => handleCourseSelect(event.target.value)}
                    >
                      {visibleCourses.map((course) => (
                        <option key={course.id} value={course.id}>
                          {course.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="training-mobile-course-meta">
                    <span>{selectedCourse.estimatedTime || "Time TBD"}</span>
                    <span>{selectedCourse.isRequired ? "Required" : "Optional"}</span>
                  </div>
                </div>
              ) : null}
              <section className="training-hero">
                <div>
                  <p className="training-description">{selectedCourse.description}</p>
                  {selectedCourse.note ? (
                    <p className="training-note">{selectedCourse.note}</p>
                  ) : null}
                </div>
                <div className={`training-status-card ${alreadyCompleted ? "complete" : "pending"}`}>
                  <span className="training-status-label">Course status</span>
                  <strong>{getCourseStatus(selectedCourse, profile)}</strong>
                  <span>
                    {alreadyCompleted && completionDateLabel
                      ? `Passed on ${completionDateLabel}`
                      : selectedCourse.estimatedTime}
                  </span>
                </div>
              </section>

              <section className="training-section">
                <div className="training-section-heading">
                  <p className="account-section-title">Course videos</p>
                  <span className="training-progress-chip">
                    {selectedCourse.lessons.length} lessons
                  </span>
                </div>
                <div className="training-lessons">
                  {selectedCourse.lessons.map((lesson) => (
                    <article key={lesson.id} className="training-lesson-card">
                      <div className="training-video-frame">
                        {lesson.embedUrl ? (
                          <iframe
                            src={lesson.embedUrl}
                            title={lesson.title}
                            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                            allowFullScreen
                          />
                        ) : (
                          <div className="training-video-placeholder">
                            <span className="training-video-placeholder-label">Video slot ready</span>
                            <p>Add the final lesson video URL in `src/authedApp/trainingCourseContent.ts`.</p>
                          </div>
                        )}
                      </div>
                      <div className="training-lesson-copy">
                        <div className="training-lesson-header">
                          <h4>{lesson.title}</h4>
                          <span>{lesson.duration}</span>
                        </div>
                        <p className="training-lesson-summary">{lesson.summary}</p>
                        <div className="training-takeaways">
                          {lesson.takeaways.map((takeaway) => (
                            <p key={takeaway} className="training-takeaway">
                              {takeaway}
                            </p>
                          ))}
                        </div>
                        {lesson.videoUrl ? (
                          <a
                            className="account-button training-link-button"
                            href={lesson.videoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open video
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="training-section">
                <div className="training-section-heading">
                  <p className="account-section-title">Quiz</p>
                  <span className="training-progress-chip">
                    {hasQuiz ? `${answeredCount}/${selectedCourse.questions?.length ?? 0} answered` : "Not added yet"}
                  </span>
                </div>

                {hasQuiz ? (
                  <>
                    <div className="training-quiz-list">
                      {selectedCourse.questions?.map((question, index) => {
                        const selectedAnswer = answers[question.id];
                        const isSubmitted = Boolean(result);
                        const isCorrect = selectedAnswer === question.correctOptionId;
                        return (
                          <article key={question.id} className="training-question-card">
                            <p className="training-question-number">Question {index + 1}</p>
                            <h4 className="training-question-title">{question.prompt}</h4>
                            <div className="training-option-list">
                              {question.options.map((option) => (
                                <label key={option.id} className="training-option">
                                  <input
                                    type="radio"
                                    name={question.id}
                                    value={option.id}
                                    checked={selectedAnswer === option.id}
                                    onChange={() => handleAnswerChange(question.id, option.id)}
                                  />
                                  <span>{option.label}</span>
                                </label>
                              ))}
                            </div>
                            {isSubmitted ? (
                              <p className={`training-explanation ${isCorrect ? "correct" : "incorrect"}`}>
                                {isCorrect ? "Correct. " : "Review this one. "}
                                {question.explanation}
                              </p>
                            ) : null}
                          </article>
                        );
                      })}
                    </div>

                    {result ? (
                      <div className={`training-result ${result.passed ? "pass" : "fail"}`}>
                        <strong>
                          Score: {result.score}% ({result.correctCount}/{selectedCourse.questions?.length ?? 0})
                        </strong>
                        <span>
                          {result.passed
                            ? "You passed the quiz."
                            : `You need ${TRAINING_PASSING_SCORE}% to pass.`}
                        </span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="loading-banner">
                    This course shell is ready. Add quiz questions when you are ready to build this one out.
                  </div>
                )}

                {message ? (
                  <div className={result?.passed ? "training-result pass" : "error-banner"}>{message}</div>
                ) : null}

                <div className="modal-actions training-actions">
                  <button
                    className="nav-button"
                    type="button"
                    onClick={() => {
                      setAnswers({});
                      setResult(null);
                      setMessage("");
                    }}
                  >
                    Reset answers
                  </button>
                  <button
                    className="account-button"
                    type="button"
                    onClick={() => void handleSubmit()}
                    disabled={saving || !hasQuiz}
                  >
                    {saving ? "Saving..." : hasQuiz ? "Submit quiz" : "Quiz coming soon"}
                  </button>
                </div>
              </section>
            </div>
          </section>
        </div>
      </div>
      {showAdminManager && profile?.role === "Admin" ? (
        <TrainingAdminManager
          courses={courses}
          onClose={() => setShowAdminManager(false)}
          onCoursesChange={(nextCourses) => {
            setCourses(nextCourses);
            setCoursesMessage("");
            if (!nextCourses.some((course) => course.id === selectedCourseId)) {
              setSelectedCourseId(nextCourses[0]?.id ?? PRIMARY_TRAINING_COURSE_ID);
            }
          }}
        />
      ) : null}
    </div>
  );
}
