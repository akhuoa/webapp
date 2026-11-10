<template>
  <div class="changelog">
    <section v-for="entry in entries" :key="entry.version" class="changelog-entry">
      <div class="changelog-entry-header">
        <span class="changelog-entry-version">Version {{ entry.version }}</span>
        <span v-if="entry.version === currentVersion" class="changelog-entry-current">Current</span>
        <span v-if="releaseDate(entry.version)" class="changelog-entry-date">{{ releaseDate(entry.version) }}</span>
      </div>
      <ul class="changelog-changes">
        <li v-for="(change, index) in entry.changes" :key="index" class="changelog-change">
          <span class="change-type" :class="`change-type-${change.type}`" role="img" v-hint="CHANGE_TYPE_LABELS[change.type]">
            <i :class="`pi ${CHANGE_TYPE_ICONS[change.type]}`" />
          </span>
          <span class="changelog-change-description">{{ change.description }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<script setup lang="ts">
import type { IOpenCORChangelogEntry, OpenCORChangelogChangeType } from '../../index';

import { vHint } from '../common/hint';
import { currentVersion } from '../common/version';

defineProps<{
  entries: IOpenCORChangelogEntry[];
}>();

const CHANGE_TYPE_LABELS: Record<OpenCORChangelogChangeType, string> = {
  added: 'Added',
  removed: 'Removed',
  improved: 'Improved',
  fixed: 'Fixed'
};

const CHANGE_TYPE_ICONS: Record<OpenCORChangelogChangeType, string> = {
  added: 'pi-plus-circle',
  removed: 'pi-minus-circle',
  improved: 'pi-arrow-circle-up',
  fixed: 'pi-wrench'
};

// The release date of the given version, if it can be determined.
// Note: our versions are of the form 1.YYYYMMDD.N, where YYYYMMDD is the date of the release.

const RELEASE_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const releaseDate = (version: string): string => {
  const match = version.match(/^\d+\.(\d{4})(\d{2})(\d{2})\.\d+$/);

  if (!match) {
    return '';
  }

  // Note: an invalid month or day (e.g., 13 or 32) would roll over (e.g., to the following year or month), so we make
  //       sure that our date is the one that was given to us.

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const date = new Date(year, month, day);

  return date.getFullYear() === year && date.getMonth() === month && date.getDate() === day
    ? RELEASE_DATE_FORMAT.format(date)
    : '';
};
</script>

<style scoped>
.changelog {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.changelog-entry {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.changelog-entry-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.5rem;
}

.changelog-entry-version {
  color: var(--p-text-color);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.changelog-entry-current {
  align-self: center;
  padding: 0 0.4375rem;
  border-radius: 9999px;
  background-color: color-mix(in srgb, var(--p-primary-color) 15%, transparent);
  color: var(--p-primary-color);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.125rem;
}

.changelog-entry-date {
  color: var(--p-text-muted-color);
  font-size: 0.8125rem;
}

.changelog-changes {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.changelog-change {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
}

/**
 * Note: our description has the same line height as the height of our change type, so that they are aligned.
 */

.changelog-change-description {
  min-width: 0;
  line-height: 1.375rem;
}

.change-type {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 1.375rem;
  height: 1.375rem;
  border: 1px solid;
  border-radius: 9999px;
}

.change-type .pi {
  font-size: 0.75rem;
}

.change-type-added {
  background-color: var(--opencor-success-background);
  border-color: var(--opencor-success-border-color);
  color: var(--opencor-success-color);
}

.change-type-removed {
  background-color: var(--opencor-error-background);
  border-color: var(--opencor-error-border-color);
  color: var(--opencor-error-color);
}

.change-type-improved {
  background-color: var(--opencor-info-background);
  border-color: var(--opencor-info-border-color);
  color: var(--opencor-info-color);
}

.change-type-fixed {
  background-color: var(--opencor-warn-background);
  border-color: var(--opencor-warn-border-color);
  color: var(--opencor-warn-color);
}
</style>
