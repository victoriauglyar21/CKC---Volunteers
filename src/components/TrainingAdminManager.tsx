import { useEffect, useMemo, useState } from "react";
import type { TrainingCourse, TrainingQuestion } from "../authedApp/trainingCourseContent";
import { deleteTrainingCourse, saveTrainingCourse } from "../authedApp/services/trainingCourseService";

type TrainingAdminManagerProps = {
  courses: TrainingCourse[];
  onClose: () => void;
  onCoursesChange: (courses: TrainingCourse[]) => void;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cloneCourse(course: TrainingCourse): TrainingCourse {
  return {
    ...course,
    audience: [...course.audience],
    lessons: course.lessons.map((lesson) => ({
      ...lesson,
      takeaways: [...lesson.takeaways],
    })),
    questions: (course.questions ?? []).map((question) => ({
      ...question,
      options: question.options.map((option) => ({ ...option })),
    })),
  };
}

function createEmptyCourse(): TrainingCourse {
  return {
    id: `course-${Date.now()}`,
    title: "",
    description: "",
    summary: "",
    estimatedTime: "",
    isRequired: true,
    audience: ["regular"],
    isPublished: true,
    lessons: [
      {
        id: `lesson-${Date.now()}`,
        title: "",
        duration: "",
        summary: "",
        embedUrl: null,
        videoUrl: null,
        takeaways: [""],
      },
    ],
    questions: [],
  };
}

export default function TrainingAdminManager({
  courses,
  onClose,
  onCoursesChange,
}: TrainingAdminManagerProps) {
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id ?? "");
  const [draft, setDraft] = useState<TrainingCourse | null>(courses[0] ? cloneCourse(courses[0]) : createEmptyCourse());
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  useEffect(() => {
    if (selectedCourse) {
      setDraft(cloneCourse(selectedCourse));
      return;
    }
    if (courses[0]) {
      setSelectedCourseId(courses[0].id);
      setDraft(cloneCourse(courses[0]));
      return;
    }
    setDraft(createEmptyCourse());
  }, [selectedCourse, courses]);

  const setLessonField = (
    lessonId: string,
    field: "title" | "duration" | "summary" | "embedUrl" | "videoUrl",
    value: string,
  ) => {
    setDraft((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        lessons: previous.lessons.map((lesson) =>
          lesson.id === lessonId ? { ...lesson, [field]: value || null } : lesson,
        ),
      };
    });
  };

  const setLessonTakeaways = (lessonId: string, value: string) => {
    setDraft((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        lessons: previous.lessons.map((lesson) =>
          lesson.id === lessonId
            ? {
                ...lesson,
                takeaways: value
                  .split("\n")
                  .map((item) => item.trim())
                  .filter(Boolean),
              }
            : lesson,
        ),
      };
    });
  };

  const setQuestionField = (
    questionId: string,
    field: keyof Omit<TrainingQuestion, "options">,
    value: string,
  ) => {
    setDraft((previous) => {
      if (!previous) return previous;
      return {
        ...previous,
        questions: (previous.questions ?? []).map((question) =>
          question.id === questionId ? { ...question, [field]: value } : question,
        ),
      };
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.title.trim()) {
      setMessage("Course title is required.");
      return;
    }
    const nextDraft = {
      ...draft,
      id: slugify(draft.id || draft.title) || `course-${Date.now()}`,
    };
    setSaving(true);
    setMessage("");
    const result = await saveTrainingCourse(nextDraft);
    if (result.error || !result.data) {
      setMessage(result.error ?? "Unable to save course.");
      setSaving(false);
      return;
    }

    const nextCourses = [...courses.filter((course) => course.id !== draft.id), result.data].sort((a, b) =>
      a.title.localeCompare(b.title),
    );
    onCoursesChange(nextCourses);
    setSelectedCourseId(result.data.id);
    setMessage("Course saved.");
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!draft?.dbId) {
      const nextCourses = courses.filter((course) => course.id !== draft?.id);
      onCoursesChange(nextCourses);
      setSelectedCourseId(nextCourses[0]?.id ?? "");
      setMessage("Unsaved draft removed.");
      return;
    }
    setDeleting(true);
    setMessage("");
    const result = await deleteTrainingCourse(draft.dbId);
    if (result.error) {
      setMessage(result.error);
      setDeleting(false);
      return;
    }
    const nextCourses = courses.filter((course) => course.dbId !== draft.dbId);
    onCoursesChange(nextCourses);
    setSelectedCourseId(nextCourses[0]?.id ?? "");
    setMessage("Course deleted.");
    setDeleting(false);
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="modal-panel account-panel training-admin-panel">
        <div className="modal-header">
          <div>
            <p className="modal-eyebrow">Admin</p>
            <h3 className="modal-title">Manage Training</h3>
          </div>
          <div className="modal-header-actions">
            <button
              className="account-button"
              type="button"
              onClick={() => {
                const next = createEmptyCourse();
                setDraft(next);
                setSelectedCourseId(next.id);
                setMessage("");
              }}
            >
              New course
            </button>
            <button className="modal-close" type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="modal-body training-admin-grid">
          <aside className="training-admin-sidebar">
            <p className="account-section-title">Courses</p>
            <div className="training-course-list">
              {courses.map((course) => (
                <button
                  key={course.id}
                  className={`training-course-nav ${course.id === (draft?.id ?? selectedCourseId) ? "active" : ""}`}
                  type="button"
                  onClick={() => {
                    setSelectedCourseId(course.id);
                    setDraft(cloneCourse(course));
                    setMessage("");
                  }}
                >
                  <div className="training-course-nav-head">
                    <span className="training-course-nav-title">{course.title}</span>
                    <span className="training-course-nav-status">
                      {course.isPublished === false ? "Draft" : "Published"}
                    </span>
                  </div>
                  <p className="training-course-nav-description">{course.description}</p>
                </button>
              ))}
            </div>
          </aside>

          <div className="training-admin-editor">
            {!draft ? null : (
              <>
                <div className="account-section">
                  <div className="account-section-header">
                    <p className="account-section-title">Course details</p>
                    <div className="modal-actions">
                      <button
                        className="nav-button"
                        type="button"
                        onClick={() => void handleDelete()}
                        disabled={deleting || saving}
                      >
                        {deleting ? "Deleting..." : "Delete"}
                      </button>
                      <button
                        className="account-button"
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={saving || deleting}
                      >
                        {saving ? "Saving..." : "Save course"}
                      </button>
                    </div>
                  </div>
                  {message ? <div className="loading-banner">{message}</div> : null}
                  <label className="form-field">
                    <span className="form-label">Title</span>
                    <input
                      className="form-input"
                      type="text"
                      value={draft.title}
                      onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Slug / ID</span>
                    <input
                      className="form-input"
                      type="text"
                      value={draft.id}
                      onChange={(event) => setDraft({ ...draft, id: slugify(event.target.value) })}
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Description</span>
                    <textarea
                      className="form-input form-textarea"
                      value={draft.description}
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    />
                  </label>
                  <div className="training-admin-meta-grid">
                    <label className="form-field">
                      <span className="form-label">Summary</span>
                      <input
                        className="form-input"
                        type="text"
                        value={draft.summary}
                        onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                      />
                    </label>
                    <label className="form-field">
                      <span className="form-label">Estimated time</span>
                      <input
                        className="form-input"
                        type="text"
                        value={draft.estimatedTime}
                        onChange={(event) => setDraft({ ...draft, estimatedTime: event.target.value })}
                      />
                    </label>
                  </div>
                  <div className="training-admin-meta-grid">
                    <label className="form-field">
                      <span className="form-label">Status label</span>
                      <input
                        className="form-input"
                        type="text"
                        value={draft.statusLabel ?? ""}
                        onChange={(event) => setDraft({ ...draft, statusLabel: event.target.value || undefined })}
                      />
                    </label>
                    <label className="form-field">
                      <span className="form-label">Note</span>
                      <input
                        className="form-input"
                        type="text"
                        value={draft.note ?? ""}
                        onChange={(event) => setDraft({ ...draft, note: event.target.value || undefined })}
                      />
                    </label>
                  </div>
                  <div className="training-admin-meta-grid">
                    <label className="training-checkbox">
                      <input
                        type="checkbox"
                        checked={draft.isRequired}
                        onChange={(event) => setDraft({ ...draft, isRequired: event.target.checked })}
                      />
                      <span>Required</span>
                    </label>
                    <label className="training-checkbox">
                      <input
                        type="checkbox"
                        checked={draft.isPublished ?? true}
                        onChange={(event) => setDraft({ ...draft, isPublished: event.target.checked })}
                      />
                      <span>Published</span>
                    </label>
                  </div>
                  <div className="training-admin-meta-grid">
                    <label className="training-checkbox">
                      <input
                        type="checkbox"
                        checked={draft.audience.includes("regular")}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            audience: event.target.checked
                              ? Array.from(new Set([...draft.audience, "regular"]))
                              : draft.audience.filter((item) => item !== "regular"),
                          })
                        }
                      />
                      <span>Assign to regular volunteers</span>
                    </label>
                    <label className="training-checkbox">
                      <input
                        type="checkbox"
                        checked={draft.audience.includes("lead")}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            audience: event.target.checked
                              ? Array.from(new Set([...draft.audience, "lead"]))
                              : draft.audience.filter((item) => item !== "lead"),
                          })
                        }
                      />
                      <span>Assign to leads</span>
                    </label>
                  </div>
                </div>

                <div className="account-section">
                  <div className="account-section-header">
                    <p className="account-section-title">Lessons</p>
                    <button
                      className="account-button"
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          lessons: [
                            ...draft.lessons,
                            {
                              id: `lesson-${Date.now()}`,
                              title: "",
                              duration: "",
                              summary: "",
                              embedUrl: null,
                              videoUrl: null,
                              takeaways: [""],
                            },
                          ],
                        })
                      }
                    >
                      Add lesson
                    </button>
                  </div>
                  <div className="training-admin-stack">
                    {draft.lessons.map((lesson) => (
                      <div key={lesson.id} className="training-admin-card">
                        <div className="account-section-header">
                          <p className="account-section-title">Lesson</p>
                          <button
                            className="nav-button"
                            type="button"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                lessons: draft.lessons.filter((item) => item.id !== lesson.id),
                              })
                            }
                          >
                            Remove
                          </button>
                        </div>
                        <label className="form-field">
                          <span className="form-label">Title</span>
                          <input className="form-input" type="text" value={lesson.title} onChange={(event) => setLessonField(lesson.id, "title", event.target.value)} />
                        </label>
                        <div className="training-admin-meta-grid">
                          <label className="form-field">
                            <span className="form-label">Duration</span>
                            <input className="form-input" type="text" value={lesson.duration} onChange={(event) => setLessonField(lesson.id, "duration", event.target.value)} />
                          </label>
                          <label className="form-field">
                            <span className="form-label">Embed URL</span>
                            <input className="form-input" type="text" value={lesson.embedUrl ?? ""} onChange={(event) => setLessonField(lesson.id, "embedUrl", event.target.value)} />
                          </label>
                        </div>
                        <label className="form-field">
                          <span className="form-label">Summary</span>
                          <textarea className="form-input form-textarea" value={lesson.summary} onChange={(event) => setLessonField(lesson.id, "summary", event.target.value)} />
                        </label>
                        <label className="form-field">
                          <span className="form-label">Video URL</span>
                          <input className="form-input" type="text" value={lesson.videoUrl ?? ""} onChange={(event) => setLessonField(lesson.id, "videoUrl", event.target.value)} />
                        </label>
                        <label className="form-field">
                          <span className="form-label">Takeaways, one per line</span>
                          <textarea
                            className="form-input form-textarea"
                            value={lesson.takeaways.join("\n")}
                            onChange={(event) => setLessonTakeaways(lesson.id, event.target.value)}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="account-section">
                  <div className="account-section-header">
                    <p className="account-section-title">Quiz questions</p>
                    <button
                      className="account-button"
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          questions: [
                            ...(draft.questions ?? []),
                            {
                              id: `question-${Date.now()}`,
                              prompt: "",
                              explanation: "",
                              correctOptionId: "a",
                              options: [
                                { id: "a", label: "" },
                                { id: "b", label: "" },
                                { id: "c", label: "" },
                              ],
                            },
                          ],
                        })
                      }
                    >
                      Add question
                    </button>
                  </div>
                  <div className="training-admin-stack">
                    {(draft.questions ?? []).map((question) => (
                      <div key={question.id} className="training-admin-card">
                        <div className="account-section-header">
                          <p className="account-section-title">Question</p>
                          <button
                            className="nav-button"
                            type="button"
                            onClick={() =>
                              setDraft({
                                ...draft,
                                questions: (draft.questions ?? []).filter((item) => item.id !== question.id),
                              })
                            }
                          >
                            Remove
                          </button>
                        </div>
                        <label className="form-field">
                          <span className="form-label">Prompt</span>
                          <textarea className="form-input form-textarea" value={question.prompt} onChange={(event) => setQuestionField(question.id, "prompt", event.target.value)} />
                        </label>
                        <div className="training-admin-stack">
                          {question.options.map((option, optionIndex) => (
                            <label key={option.id} className="form-field">
                              <span className="form-label">Option {option.id.toUpperCase()}</span>
                              <input
                                className="form-input"
                                type="text"
                                value={option.label}
                                onChange={(event) =>
                                  setDraft({
                                    ...draft,
                                    questions: (draft.questions ?? []).map((item) =>
                                      item.id === question.id
                                        ? {
                                            ...item,
                                            options: item.options.map((currentOption, currentIndex) =>
                                              currentIndex === optionIndex
                                                ? { ...currentOption, label: event.target.value }
                                                : currentOption,
                                            ),
                                          }
                                        : item,
                                    ),
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                        <label className="form-field">
                          <span className="form-label">Correct option ID</span>
                          <input className="form-input" type="text" value={question.correctOptionId} onChange={(event) => setQuestionField(question.id, "correctOptionId", event.target.value)} />
                        </label>
                        <label className="form-field">
                          <span className="form-label">Explanation</span>
                          <textarea className="form-input form-textarea" value={question.explanation} onChange={(event) => setQuestionField(question.id, "explanation", event.target.value)} />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
