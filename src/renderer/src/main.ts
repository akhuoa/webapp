import { createApp } from 'vue';

import './demo.css';

import App from './App.vue';
// import App from './AppWithinContainers.vue';
// import App from './AppWithMultipleInstances.vue';
// import App from './AppWithOmex.vue';
// import App from './AppWithRawOmex.vue';
// import App from './AppWithSimulationData.vue';
// import App from './AppWithExternalData.vue';

createApp(App).mount('#app');

// Prevent a file that is dropped outside of the area where we handle drag and drop (e.g., on a dialog's mask or on our
// blocking overlay while OpenCOR is initialising) from being opened by the browser, which would replace OpenCOR with
// that file.
// Note #1: a drag that is over the area where we handle drag and drop has already been handled (i.e. its default
//          action has been prevented) by the time it reaches the document, so we leave it alone.
// Note #2: we only do this for files, so that some text can still be dragged and dropped into an input field.
// Note #3: we do this here rather than in our OpenCOR component since, when OpenCOR is used as a library, it is not for
//          us to decide what happens when a file is dropped outside of OpenCOR.

const preventFileDropOutsideOpenCOR = (event: DragEvent): void => {
  if (!event.defaultPrevented && event.dataTransfer?.types.includes('Files')) {
    event.preventDefault();

    event.dataTransfer.dropEffect = 'none';
  }
};

document.addEventListener('dragover', preventFileDropOutsideOpenCOR);
document.addEventListener('drop', preventFileDropOutsideOpenCOR);

// Note: we are using the "opencor" class as the Tailwind CSS `important` selector to help protect our styles from being
//       overridden by the styles of a host application when OpenCOR is used as a library. Layered CSS (e.g.,
//       `@layer base`) always loses to unlayered CSS, regardless of specificity, so using an `important` selector alone
//       is not sufficient if our styles remain in a Tailwind CSS layer. Our actual solution relies on 1) using the
//       "opencor" class as the Tailwind CSS `important` selector and on 2) unwrapping/stripping Tailwind CSS layers in
//       the library build, so that OpenCOR's styles are emitted as unlayered CSS with higher effective specificity than
//       the host application's styles.
