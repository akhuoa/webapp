<template>
  <div class="issues opencor-panel">
    <!-- Header -->

    <div class="issues-header">
      <div class="issues-title">
        <i class="pi pi-exclamation-circle issues-title-icon" />
        <span>Issues</span>
      </div>
      <div v-if="issues.length" class="issues-summary">
        <span v-for="summaryItem in summaryItems" :key="summaryItem.type" class="issues-summary-item" :class="summaryItem.class">
          <i :class="summaryItem.icon" aria-hidden="true" /><span class="sr-only">{{ summaryItem.label }}: </span>{{ summaryItem.count }}
        </span>
        <ToolbarButtonWidget
          v-bind="copyToClipboard.buttonProps('Copy issues')"
          small
          tooltipAlign="end"
          @click="copyIssues"
        />
      </div>
    </div>

    <!-- Content -->

    <div class="issues-content">
      <!-- Empty state -->

      <div v-if="!issues.length" class="issues-empty">
        <i class="pi pi-check-circle" />
        <span>No issues found.</span>
      </div>

      <!-- Issues -->

      <ScrollPanel v-else class="h-full">
        <div class="issues-list" :class="{ 'issues-list-extra-space': extraSpace }">
          <div v-for="(issue, index) in issues" :key="`issue_${index}`" class="issue" :class="ISSUE_TYPES[issue.type].class">
            <i :class="ISSUE_TYPES[issue.type].icon" class="issue-icon" aria-hidden="true" />
            <span class="sr-only">{{ ISSUE_TYPES[issue.type].label }}: </span>
            <span class="issue-description" v-html="issue.description" />
          </div>
        </div>
      </ScrollPanel>
    </div>
  </div>
</template>

<script setup lang="ts">
import * as vue from 'vue';

import * as vueCommon from '../../common/vueCommon';
import * as locApi from '../../libopencor/locApi';

const props = withDefaults(
  defineProps<{
    issues: locApi.IIssue[];
    extraSpace?: boolean;
  }>(),
  {
    extraSpace: true
  }
);

// Our issue types, in order of severity.

const ISSUE_TYPES: Record<locApi.EIssueType, { label: string; icon: string; class: string }> = {
  [locApi.EIssueType.ERROR]: { label: 'Error', icon: 'pi pi-times-circle', class: 'issue-error' },
  [locApi.EIssueType.WARNING]: { label: 'Warning', icon: 'pi pi-exclamation-triangle', class: 'issue-warning' },
  [locApi.EIssueType.INFORMATION]: { label: 'Information', icon: 'pi pi-info-circle', class: 'issue-information' }
};

// The number of issues of each type, if any.
// Note: the icon of a type is not visible to assistive technologies, so we use a visually hidden label instead (so
//       that, for instance, "Errors: 2" rather than just "2" gets announced).

const SUMMARY_LABELS: Record<locApi.EIssueType, string> = {
  [locApi.EIssueType.ERROR]: 'Errors',
  [locApi.EIssueType.WARNING]: 'Warnings',
  [locApi.EIssueType.INFORMATION]: 'Information'
};

const summaryItems = vue.computed<
  { type: locApi.EIssueType; icon: string; class: string; label: string; count: number }[]
>(() => {
  return [locApi.EIssueType.ERROR, locApi.EIssueType.WARNING, locApi.EIssueType.INFORMATION]
    .map((type) => {
      return {
        type,
        icon: ISSUE_TYPES[type].icon,
        class: ISSUE_TYPES[type].class,
        label: SUMMARY_LABELS[type],
        count: props.issues.filter((issue) => issue.type === type).length
      };
    })
    .filter((summaryItem) => summaryItem.count);
});

// Copy our issues, as plain text, to the clipboard, so that they can easily be included in an issue report, for
// instance.
// Note #1: the description of an issue may contain some HTML (e.g., to emphasise part of it), hence we only keep its
//          text.
// Note #2: our issues may change while our copy button lets people know whether they were copied (e.g., if a simulation
//          input of an interactive simulation experiment view is changed straight after copying), in which case we
//          reset our copy button since its feedback would no longer be about our (current) issues. We only do this if
//          what would be copied has changed, i.e. not if our issues are recomputed and are the same as before.

const copyToClipboard = vueCommon.useCopyToClipboard();

const issuesText = vue.computed<string>(() => {
  const domParser = new DOMParser();

  return props.issues
    .map((issue) => {
      const description = domParser.parseFromString(issue.description, 'text/html').body.textContent ?? '';

      return `${ISSUE_TYPES[issue.type].label}: ${description}`;
    })
    .join('\n');
});

const copyIssues = (): void => {
  void copyToClipboard.copy(issuesText.value);
};

vue.watch(issuesText, () => {
  copyToClipboard.reset();
});
</script>

<style scoped>
/**
 * Note: we may be shown in a narrow container (e.g., when OpenCOR is embedded in a page alongside other OpenCOR
 *       instances), so we adapt our layout to the width of our container: our header can wrap and, if really narrow,
 *       the icon of an issue gets shown inline with its description, which can then use all of the available width.
 */

.issues {
  display: flex;
  flex-direction: column;
  container-type: inline-size;
}

/**
 * Header.
 */

.issues-header {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
  min-height: 2.5rem;
  padding: 0.375rem 0.5rem 0.375rem 0.875rem;
  border-bottom: 1px solid var(--p-content-border-color);
}

.issues-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--p-text-color);
  font-size: 0.875rem;
  font-weight: 600;
}

.issues-title-icon {
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.issues-summary {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  margin-left: auto;
}

.issues-summary-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}

.issues-summary-item .pi {
  font-size: 0.75rem;
}

/**
 * Content.
 */

.issues-content {
  flex-grow: 1;
  min-height: 0;
}

/**
 * Note: PrimeVue makes the content of a scroll panel wider and taller than the scroll panel itself, and then pads it,
 *       so that the native scrollbars are out of view. However, those scrollbars are hidden anyway, so we don't need
 *       that trick, which would otherwise clip the right side of our issues and add some space below them.
 */

:deep(.p-scrollpanel-content) {
  width: 100%;
  height: 100%;
  padding: 0;
}

.issues-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  min-height: 4rem;
  padding: 1rem;
  color: var(--opencor-success-color);
  font-size: 0.875rem;
}

.issues-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.625rem;
}

.issues-list-extra-space {
  padding-bottom: 1.125rem;
}

.issue {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid color-mix(in srgb, var(--issue-color) 25%, transparent);
  border-radius: 0.375rem;
  background-color: color-mix(in srgb, var(--issue-color) 6%, transparent);
}

/**
 * Note: our icon is as tall as the first line of our description, so that it is aligned with it.
 */

.issue-icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  height: 1.25rem;
  color: var(--issue-color);
  font-size: 0.875rem;
}

.issue-description {
  flex-grow: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--p-text-color);
  font-size: 0.8125rem;
  line-height: 1.25rem;
  user-select: text;
}

/**
 * Severities.
 */

.issue-error {
  --issue-color: var(--opencor-error-color);

  color: var(--issue-color);
}

.issue-warning {
  --issue-color: var(--opencor-warn-color);

  color: var(--issue-color);
}

.issue-information {
  --issue-color: var(--opencor-info-color);

  color: var(--issue-color);
}

/**
 * Adapt our layout to the width of our container.
 */

@container (width < 16rem) {
  .issues-header {
    padding-left: 0.625rem;
  }

  .issues-list {
    padding: 0.375rem;
  }

  .issue {
    display: block;
    padding: 0.375rem 0.5rem;
  }

  .issue-icon {
    display: inline;
    margin-right: 0.375rem;
  }
}
</style>
