import type * as bg2cellml from '@physiomelinks/bg2cellml';

import * as locApi from '../libopencor/locApi';

import { loadCellDLRuntime } from './celldlRuntime';
import * as common from './common';
import * as dependencies from './dependencies';

// Initialise the converter that is needed to generate CellML from a CellDL file.
// Note #1: this means downloading libCellML (~2 MB) and Oxigraph (~4 MB), so we only do it when needed and only once.
// Note #2: this relies on the BG-RDF framework, which CellDL Editor only makes available once it has been initialised
//          (otherwise, bgRdfStatements() returns no statement), hence it must only be called once CellDL Editor has
//          been loaded.
// Note #3: CellDL Editor comes with its own copy of Oxigraph (bundled from @celldl/rdf), but it doesn't expose it, hence
//          we need our own copy (which @physiomelinks/bg2cellml expects as a peer dependency).

let converterInitialisation: Promise<bg2cellml.Converter> | null = null;
let converterInitialised = false;

export const isConverterInitialised = (): boolean => {
  return converterInitialised;
};

const initialisedConverter = (progress: (percent: number) => void = () => {}): Promise<bg2cellml.Converter> => {
  converterInitialisation ??= (async () => {
    const runtime = await loadCellDLRuntime();

    if (!runtime.editorInitialised()) {
      throw new Error('CellDL Editor has not been initialised.');
    }

    // Load libCellML and Oxigraph, and then set up the BG-RDF framework, reporting our progress as we go.

    const nbOfSteps = 3;
    let crtStep = 0;
    const step = (): void => {
      progress(Math.floor((100 * ++crtStep) / nbOfSteps));
    };

    const [bg2cellmlModule, libcellml, oxigraph] = await Promise.all([
      runtime.bg2cellml(),
      runtime.libcellml().then(async (module) => {
        const libcellml = await module.default();

        step();

        return libcellml;
      }),
      runtime.oxigraph().then(async (module) => {
        await module.default();

        step();

        return module;
      })
    ]);
    const res = new bg2cellmlModule.Converter({ libcellml, oxigraph });
    const issues = res.loadFramework({ quads: runtime.bgRdfStatements() });

    if (issues.length) {
      throw new Error(`The BG-RDF framework could not be loaded (${issues.join(' ')}).`);
    }

    step();

    converterInitialised = true;

    return res;
  })().catch((error: unknown) => {
    // Something went wrong, so allow for another attempt.

    converterInitialisation = null;

    throw error;
  });

  return converterInitialisation;
};

export const initialiseConverter = async (progress: (percent: number) => void): Promise<void> => {
  await initialisedConverter(progress);
};

// Generate CellML from the given CellDL file.

export interface ICellmlFromCelldl {
  cellml?: string;
  issues: string[];
}

export const cellmlFromCelldl = async (celldl: string, celldlFileName: string): Promise<ICellmlFromCelldl> => {
  const converter = await initialisedConverter();

  // Note: the source URI must be a valid IRI, hence we encode our file name (which may, for instance, contain spaces).

  const res = await converter.celldl2cellml(celldl, {
    sourceUri: `https://celldl.org/cellml/${encodeURIComponent(celldlFileName)}`
  });

  // Everything went well, so return the generated CellML.
  // Note: we consider empty CellML to be a failure since there would be nothing to simulate or export.

  if (res.cellml) {
    return {
      cellml: res.cellml,
      issues: []
    };
  }

  // There was a problem generating some CellML, so report the issues that were encountered.

  if (res.issues?.length) {
    return {
      issues: res.issues
    };
  }

  // Something went wrong, so report it.

  return {
    issues: [`An unexpected error occurred while generating CellML${res.exception ? ` (${res.exception})` : ''}.`]
  };
};

// Create a COMBINE archive for the given CellML file, i.e. with the CellML file itself, a SED-ML file (which we get
// libOpenCOR to create for us), and the CellDL file from which the CellML file was generated.

export const combineArchive = (cellml: string, celldl: string): dependencies.Module => {
  const cellmlFile = new locApi.File(
    `${common.CELLML_PREFIX}${common.nextCellmlDataUrlNumber()}/model.cellml`,
    new TextEncoder().encode(cellml)
  );
  let sedml: string;

  try {
    const document = cellmlFile.document();

    // Note: our SED-ML file references our CellML file using its (URL-encoded) path, which we replace with the location
    //       of our CellML file in our COMBINE archive.

    try {
      sedml = document.serialise().replace(/(<model\b[^>]*\bsource=")[^"]*"/, '$1model.cellml"');
    } finally {
      document.release();
    }
  } finally {
    cellmlFile.release();
  }

  const res = new dependencies._jsZip();

  res.file(
    'manifest.xml',
    `<?xml version='1.0' encoding='UTF-8' standalone='yes'?>
<omexManifest xmlns="http://identifiers.org/combine.specifications/omex-manifest">
  <content location="." format="http://identifiers.org/combine.specifications/omex"/>
  <content location="document.sedml" format="http://identifiers.org/combine.specifications/sed-ml" master="true"/>
  <content location="model.cellml" format="http://identifiers.org/combine.specifications/cellml"/>
  <content location="model.celldl" format="http://purl.org/NET/mediatypes/image/svg+xml"/>
</omexManifest>
`
  );
  res.file('document.sedml', sedml);
  res.file('model.cellml', cellml);
  res.file('model.celldl', celldl);

  return res;
};
