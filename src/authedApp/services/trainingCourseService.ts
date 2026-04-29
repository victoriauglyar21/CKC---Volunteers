import { supabase } from "../../supabaseClient";
import type {
  TrainingAudience,
  TrainingCourse,
  TrainingLesson,
  TrainingQuestion,
} from "../trainingCourseContent";

type CourseRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  summary: string | null;
  estimated_time: string | null;
  is_required: boolean | null;
  status_label: string | null;
  note: string | null;
  audience: "regular" | "lead" | "both" | null;
  is_published: boolean | null;
  sort_order: number | null;
};

type LessonRow = {
  id: string;
  course_id: string;
  title: string;
  duration: string | null;
  summary: string | null;
  embed_url: string | null;
  video_url: string | null;
  takeaways: unknown;
  sort_order: number | null;
};

type QuestionRow = {
  id: string;
  course_id: string;
  prompt: string;
  explanation: string | null;
  correct_option_id: string | null;
  options: unknown;
  sort_order: number | null;
};

type CompletionRow = {
  user_id: string;
  course_id: string;
};

function parseAudience(value: CourseRow["audience"]): TrainingAudience[] {
  if (value === "lead") return ["lead"];
  if (value === "regular") return ["regular"];
  return ["regular", "lead"];
}

function serializeAudience(audience: TrainingAudience[]) {
  const hasRegular = audience.includes("regular");
  const hasLead = audience.includes("lead");
  if (hasRegular && hasLead) return "both";
  if (hasLead) return "lead";
  return "regular";
}

function ensureStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function ensureQuestionOptions(value: unknown) {
  if (!Array.isArray(value)) return [] as { id: string; label: string }[];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const candidate = item as { id?: unknown; label?: unknown };
      if (typeof candidate.id !== "string" || typeof candidate.label !== "string") return null;
      return { id: candidate.id, label: candidate.label };
    })
    .filter((item): item is { id: string; label: string } => Boolean(item));
}

export async function fetchTrainingCourses() {
  const [coursesResult, lessonsResult, questionsResult] = await Promise.all([
    supabase
      .from("training_courses")
      .select(
        "id, slug, title, description, summary, estimated_time, is_required, status_label, note, audience, is_published, sort_order",
      )
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    supabase
      .from("training_lessons")
      .select("id, course_id, title, duration, summary, embed_url, video_url, takeaways, sort_order")
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    supabase
      .from("training_questions")
      .select("id, course_id, prompt, explanation, correct_option_id, options, sort_order")
      .order("sort_order", { ascending: true })
      .order("prompt", { ascending: true }),
  ]);

  if (coursesResult.error) {
    return { data: [] as TrainingCourse[], error: coursesResult.error.message };
  }
  if (lessonsResult.error) {
    return { data: [] as TrainingCourse[], error: lessonsResult.error.message };
  }
  if (questionsResult.error) {
    return { data: [] as TrainingCourse[], error: questionsResult.error.message };
  }

  const lessonsByCourse = new Map<string, TrainingLesson[]>();
  (lessonsResult.data as LessonRow[]).forEach((lesson) => {
    const items = lessonsByCourse.get(lesson.course_id) ?? [];
    items.push({
      id: lesson.id,
      title: lesson.title,
      duration: lesson.duration ?? "",
      summary: lesson.summary ?? "",
      embedUrl: lesson.embed_url,
      videoUrl: lesson.video_url,
      takeaways: ensureStringArray(lesson.takeaways),
    });
    lessonsByCourse.set(lesson.course_id, items);
  });

  const questionsByCourse = new Map<string, TrainingQuestion[]>();
  (questionsResult.data as QuestionRow[]).forEach((question) => {
    const items = questionsByCourse.get(question.course_id) ?? [];
    items.push({
      id: question.id,
      prompt: question.prompt,
      explanation: question.explanation ?? "",
      correctOptionId: question.correct_option_id ?? "",
      options: ensureQuestionOptions(question.options),
    });
    questionsByCourse.set(question.course_id, items);
  });

  const data = (coursesResult.data as CourseRow[]).map<TrainingCourse>((course) => ({
    dbId: course.id,
    id: course.slug,
    title: course.title,
    description: course.description ?? "",
    summary: course.summary ?? "",
    estimatedTime: course.estimated_time ?? "",
    isRequired: course.is_required ?? false,
    statusLabel: course.status_label ?? undefined,
    note: course.note ?? undefined,
    audience: parseAudience(course.audience),
    isPublished: course.is_published ?? true,
    lessons: lessonsByCourse.get(course.id) ?? [],
    questions: questionsByCourse.get(course.id) ?? [],
  }));

  return { data, error: null };
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function saveTrainingCourse(course: TrainingCourse) {
  const slug = slugify(course.id || course.title);
  const basePayload = {
    slug,
    title: course.title.trim(),
    description: course.description.trim(),
    summary: course.summary.trim(),
    estimated_time: course.estimatedTime.trim(),
    is_required: course.isRequired,
    status_label: course.statusLabel?.trim() || null,
    note: course.note?.trim() || null,
    audience: serializeAudience(course.audience),
    is_published: course.isPublished ?? true,
  };

  const courseResult = course.dbId
    ? await supabase
        .from("training_courses")
        .update(basePayload)
        .eq("id", course.dbId)
        .select("id")
        .single()
    : await supabase
        .from("training_courses")
        .insert({
          ...basePayload,
          sort_order: 0,
        })
        .select("id")
        .single();

  if (courseResult.error || !courseResult.data) {
    return { error: courseResult.error?.message ?? "Unable to save course.", data: null };
  }

  const courseId = courseResult.data.id;

  const deleteLessonsResult = await supabase.from("training_lessons").delete().eq("course_id", courseId);
  if (deleteLessonsResult.error) {
    return { error: deleteLessonsResult.error.message, data: null };
  }
  const deleteQuestionsResult = await supabase
    .from("training_questions")
    .delete()
    .eq("course_id", courseId);
  if (deleteQuestionsResult.error) {
    return { error: deleteQuestionsResult.error.message, data: null };
  }

  if (course.lessons.length > 0) {
    const lessonsPayload = course.lessons.map((lesson, index) => ({
      course_id: courseId,
      title: lesson.title.trim() || `Lesson ${index + 1}`,
      duration: lesson.duration.trim() || null,
      summary: lesson.summary.trim() || null,
      embed_url: lesson.embedUrl?.trim() || null,
      video_url: lesson.videoUrl?.trim() || null,
      takeaways: lesson.takeaways.map((item) => item.trim()).filter(Boolean),
      sort_order: index,
    }));
    const lessonInsertResult = await supabase.from("training_lessons").insert(lessonsPayload);
    if (lessonInsertResult.error) {
      return { error: lessonInsertResult.error.message, data: null };
    }
  }

  const normalizedQuestions = (course.questions ?? [])
    .map((question, index) => ({
      course_id: courseId,
      prompt: question.prompt.trim(),
      explanation: question.explanation.trim() || null,
      correct_option_id: question.correctOptionId.trim() || null,
      options: question.options
        .map((option) => ({ id: option.id.trim(), label: option.label.trim() }))
        .filter((option) => option.id && option.label),
      sort_order: index,
    }))
    .filter((question) => question.prompt);

  if (normalizedQuestions.length > 0) {
    const questionInsertResult = await supabase.from("training_questions").insert(normalizedQuestions);
    if (questionInsertResult.error) {
      return { error: questionInsertResult.error.message, data: null };
    }
  }

  const refreshed = await fetchTrainingCourses();
  if (refreshed.error) {
    return { error: refreshed.error, data: null };
  }

  const savedCourse = refreshed.data.find((item) => item.dbId === courseId || item.id === slug) ?? null;
  return { error: null, data: savedCourse };
}

export async function deleteTrainingCourse(courseDbId: string) {
  const result = await supabase.from("training_courses").delete().eq("id", courseDbId);
  if (result.error) {
    return { error: result.error.message };
  }
  return { error: null };
}

export async function saveTrainingCourseCompletion(params: {
  userId: string;
  courseDbId: string;
  score: number;
}) {
  const result = await supabase
    .from("training_course_completions")
    .upsert(
      {
        user_id: params.userId,
        course_id: params.courseDbId,
        score: params.score,
        completed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,course_id" },
    )
    .select("user_id, course_id")
    .single();

  if (result.error) {
    return { error: result.error.message };
  }
  return { error: null };
}

export async function fetchTrainingCompletionRows() {
  const result = await supabase
    .from("training_course_completions")
    .select("user_id, course_id");

  if (result.error) {
    return { data: [] as CompletionRow[], error: result.error.message };
  }

  return { data: (result.data as CompletionRow[]) ?? [], error: null };
}
