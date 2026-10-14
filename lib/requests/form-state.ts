export interface RequestFormState {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Submitted values, echoed back so the form keeps them after an error. */
  values?: Record<string, string>;
  reference?: string;
}

export const INITIAL_FORM_STATE: RequestFormState = { status: "idle" };
