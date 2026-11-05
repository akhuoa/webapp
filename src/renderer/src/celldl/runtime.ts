// Our CellDL runtime, i.e. CellDL Editor and what is needed to generate CellML from a CellDL file.
// Note #1: our CellDL runtime is big (~15 MB), so OpenCOR's Web app and our library don't include it, but load a
//          separate build of it at runtime (see vite.celldl.config.ts and common/celldlRuntime.ts). OpenCOR, on the
//          other hand, includes it (although it still only loads it when needed).
// Note #2: CellDL Editor's stylesheet is imported as a string, so that it can be injected the same way whether our
//          CellDL runtime is included or loaded at runtime.
// Note #3: the converter needs libCellML (~2 MB) and Oxigraph (~4 MB), so we only load them when needed.

import celldlEditorCss from '@celldl/editor/style.css?inline';

export { bgRdfStatements, CellDLEditor, editorInitialised } from '@celldl/editor';
export { celldlEditorCss };

export const bg2cellml = () => import('@physiomelinks/bg2cellml');
export const libcellml = () => import('libcellml.js');
export const oxigraph = () => import('oxigraph/web.js');
