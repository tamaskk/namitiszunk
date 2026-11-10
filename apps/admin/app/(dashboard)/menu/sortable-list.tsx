// Client-only: imported by menu-editor.tsx, which carries the "use client" boundary.
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, cn } from "@namitiszunk/ui";
import { GripVertical } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

/**
 * A vertical list the owner reorders by dragging the grip, or with the keyboard (Space, arrows,
 * Space). onReorder gets the new id order; the caller saves it.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  handleLabel,
  children,
  className,
}: {
  items: T[];
  /** Accessible name of the grip, e.g. "Move Gin tonic". */
  handleLabel: (item: T) => string;
  onReorder: (ids: string[]) => void;
  children: (item: T, handle: ReactNode) => ReactNode;
  className?: string;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const ids = items.map((item) => item.id);
    onReorder(
      arrayMove(
        ids,
        ids.indexOf(String(active.id)),
        ids.indexOf(String(over.id)),
      ),
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <ul className={cn("flex flex-col gap-2", className)}>
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id} label={handleLabel(item)}>
              {(handle) => children(item, handle)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: (handle: ReactNode) => ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(isDragging && "relative z-10 opacity-80")}
    >
      {children(
        <DragHandle
          ref={setActivatorNodeRef}
          aria-label={label}
          {...attributes}
          {...listeners}
        />,
      )}
    </li>
  );
}

function DragHandle(props: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="w-12 shrink-0 cursor-grab touch-none px-0"
      {...props}
    >
      <GripVertical aria-hidden />
    </Button>
  );
}
