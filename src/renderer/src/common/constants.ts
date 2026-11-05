export const URI_SCHEME: string = 'opencor';
export const FULL_URI_SCHEME: string = `${URI_SCHEME}://`;

export const NO_DELAY: number = 0;
export const VERY_SHORT_DELAY: number = 19;
export const SHORT_DELAY: number = 69;
export const MEDIUM_DELAY: number = 169;
export const LONG_DELAY: number = 369;

export const TOAST_LIFE: number = 3000;

export const SPIN_INITIAL_DELAY: number = 500;
export const SPIN_REPEAT_DELAY: number = 40;
export const SPIN_LARGE_STEP_FACTOR: number = 10;

const crtYear: number = new Date().getFullYear();

export const COPYRIGHT: string = crtYear === 2025 ? '2025' : `2025-${crtYear}`;
