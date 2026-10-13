import { Annotation, EditorSelection, EditorState, Extension, Prec, RangeSetBuilder, Transaction } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, keymap, ViewPlugin, ViewUpdate, WidgetType } from "@codemirror/view";
import { Notice } from "obsidian";
import { clampCursor, findHiddenId } from "./hidden-id";

const bypassClamp = Annotation.define<boolean>();

class HiddenIdWidget extends WidgetType {
  constructor(readonly id: string) {
    super();
  }

  eq(other: HiddenIdWidget): boolean {
    return other.id === this.id;
  }

  toDOM(): HTMLElement {
    const dot = document.createElement("span");
    const label = `${this.id} (pipeline id)`;
    dot.className = "bw-queue-id";
    dot.title = label;
    dot.setAttribute("aria-label", label);
    dot.addEventListener("click", () => new Notice(label));
    return dot;
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const hidden = findHiddenId(line.text);
      if (hidden) {
        builder.add(
          line.from + hidden.from,
          line.from + hidden.to,
          Decoration.replace({ widget: new HiddenIdWidget(hidden.id) }),
        );
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

const hiddenIdPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (update.docChanged || update.viewportChanged) this.decorations = buildDecorations(update.view);
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) => EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? Decoration.none),
  },
);

function clampSelection(tr: Transaction): Transaction | readonly [Transaction, { selection: EditorSelection; sequential: true }] {
  if (!tr.selection || tr.annotation(bypassClamp)) return tr;
  const doc = tr.newDoc;
  const oldRanges = tr.startState.selection.ranges;
  let changed = false;
  const ranges = tr.selection.ranges.map((range, index) => {
    if (!range.empty) return range;
    const line = doc.lineAt(range.head);
    const old = oldRanges[index];
    const oldHead = old && old.empty ? tr.changes.mapPos(old.head) - line.from : null;
    const head = line.from + clampCursor(line.text, oldHead, range.head - line.from, line.number < doc.lines);
    if (head === range.head) return range;
    changed = true;
    return EditorSelection.cursor(head);
  });
  if (!changed) return tr;
  return [tr, { selection: EditorSelection.create(ranges, tr.selection.mainIndex), sequential: true }] as const;
}

function enterAfterHiddenId(view: EditorView): boolean {
  const { state } = view;
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return false;
  const line = state.doc.lineAt(state.selection.main.head);
  const hidden = findHiddenId(line.text);
  if (!hidden || state.selection.main.head !== line.from + hidden.from) return false;
  view.dispatch({ selection: EditorSelection.cursor(line.to), annotations: bypassClamp.of(true) });
  return false;
}

export function hiddenIdExtension(): Extension {
  return [
    hiddenIdPlugin,
    EditorState.transactionFilter.of(clampSelection),
    Prec.highest(keymap.of([{ key: "Enter", run: enterAfterHiddenId }])),
  ];
}
