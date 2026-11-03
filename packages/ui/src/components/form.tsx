"use client";

import { Slot } from "radix-ui";
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  type ComponentProps,
} from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { cn } from "../lib/cn";
import { Label } from "./label";

// shadcn's react-hook-form binding; schemas come from @namitiszunk/validators via the app's resolver.
const Form = FormProvider;

const FieldContext = createContext<{ name: string } | null>(null);
type ItemContextValue = {
  id: string;
  hasDescription: boolean;
  setHasDescription: (value: boolean) => void;
};
const ItemContext = createContext<ItemContextValue | null>(null);

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>(props: ControllerProps<TFieldValues, TName>) {
  return (
    <FieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FieldContext.Provider>
  );
}

function useFormField() {
  const field = useContext(FieldContext);
  const item = useContext(ItemContext);
  if (!field || !item) {
    throw new Error(
      "useFormField must be used inside <FormField> and <FormItem>",
    );
  }
  const { getFieldState } = useFormContext();
  const formState = useFormState({ name: field.name });
  const fieldState = getFieldState(field.name, formState);

  return {
    name: field.name,
    hasDescription: item.hasDescription,
    setHasDescription: item.setHasDescription,
    formItemId: `${item.id}-item`,
    formDescriptionId: `${item.id}-description`,
    formMessageId: `${item.id}-message`,
    ...fieldState,
  };
}

function FormItem({ className, ...props }: ComponentProps<"div">) {
  const id = useId();
  const [hasDescription, setHasDescription] = useState(false);
  return (
    <ItemContext.Provider value={{ id, hasDescription, setHasDescription }}>
      <div className={cn("grid gap-2", className)} {...props} />
    </ItemContext.Provider>
  );
}

function FormLabel({ className, ...props }: ComponentProps<typeof Label>) {
  const { formItemId } = useFormField();
  return <Label className={className} htmlFor={formItemId} {...props} />;
}

function FormControl(props: ComponentProps<typeof Slot.Root>) {
  const {
    error,
    formItemId,
    formDescriptionId,
    formMessageId,
    hasDescription,
  } = useFormField();
  // Only point at elements that exist; a dangling id is noise for screen readers.
  const describedBy = [
    hasDescription ? formDescriptionId : null,
    error ? formMessageId : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <Slot.Root
      id={formItemId}
      aria-describedby={describedBy || undefined}
      aria-invalid={!!error}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: ComponentProps<"p">) {
  const { formDescriptionId, setHasDescription } = useFormField();
  useEffect(() => {
    setHasDescription(true);
    return () => setHasDescription(false);
  }, [setHasDescription]);
  return (
    <p
      id={formDescriptionId}
      className={cn("text-small text-text-muted", className)}
      {...props}
    />
  );
}

/** Shows the field error; the message is the translated string the resolver returned. */
function FormMessage({ className, children, ...props }: ComponentProps<"p">) {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error.message ?? "") : children;
  if (!body) return null;
  return (
    <p
      id={formMessageId}
      className={cn("text-small text-danger", className)}
      {...props}
    >
      {body}
    </p>
  );
}

export {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
};
