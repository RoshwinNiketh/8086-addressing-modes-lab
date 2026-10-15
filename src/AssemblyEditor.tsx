import Editor, { loader, type EditorProps } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api.js";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
monaco.languages.register({ id: "asm8086" });
monaco.languages.setMonarchTokensProvider("asm8086", {
  tokenizer: {
    root: [
      [/;.*/, "comment"],
      [/\b(MOV|LEA|ADD|SUB|INC|DEC|CMP|JMP|JZ|JNZ|NOP|HLT)\b/i, "keyword"],
      [
        /\b(AX|BX|CX|DX|SI|DI|BP|SP|AL|AH|BL|BH|CL|CH|DL|DH|DS|ES|SS|CS)\b/i,
        "type",
      ],
      [/\b(0x[\da-f]+|[\da-f]+h|\d+)\b/i, "number"],
      [/\.[A-Z]+/i, "keyword"],
      [/[A-Z_]\w*:/i, "tag"],
    ],
  },
});
export default function AssemblyEditor(props: EditorProps) {
  return <Editor {...props} />;
}
