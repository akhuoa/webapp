<template>
  <div class="unsupported-view">
    <span class="unsupported-view-icon" :style="{ '--view-color': viewCategory.color }">
      <i class="pi pi-file" />
    </span>
    <p class="unsupported-view-title">Unsupported file type</p>
    <p class="unsupported-view-text">
      The <span :style="{ color: viewCategory.color }">{{ viewName }}</span> view does not support this type of file.
    </p>
    <template v-if="supportingViews.length">
      <p class="unsupported-view-text">It can be opened in:</p>
      <div class="unsupported-view-actions">
        <Button v-for="view in supportingViews" :key="view.id"
          :label="view.label"
          severity="secondary"
          size="small"
          @click="emit('selectView', view.id)"
        >
          <template #icon>
            <i v-if="typeof view.icon === 'string'" :class="view.icon" class="unsupported-view-action-icon" :style="{ color: view.category.color }" />
            <span v-else class="unsupported-view-action-icon unsupported-view-action-image"
              :style="{ color: view.category.color, maskImage: `url(&quot;${view.icon.url}&quot;)` }"
            />
          </template>
        </Button>
      </div>
    </template>
    <p v-else class="unsupported-view-text">No view supports this type of file.</p>
  </div>
</template>

<script setup lang="ts">
import type { IViewDescriptor, ViewCategory } from '../../common/viewRegistry';

// A view that is shown instead of the view that was chosen for a file when that view doesn't support the file, and
// which lets the user switch to a view that does support it, if any.
// Note: like in our view switcher (see ViewSwitcherComponent.vue), a view icon that is an image is used as a mask, and
//       Vite inlines an SVG file as a data URL which may contain single quotes, hence we use double quotes in url().

defineProps<{
  viewName: string;
  viewCategory: ViewCategory;
  supportingViews: IViewDescriptor[];
}>();

const emit = defineEmits<{
  selectView: [viewId: string];
}>();
</script>

<style scoped>
/**
 * Note: we are laid out like the empty state of our interactive simulation experiment view (see
 *       SimulationExperimentInteractiveView.vue), except that our icon is in a circle that is tinted with the colour of
 *       the category of our view.
 */

.unsupported-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  height: 100%;
  padding: 1rem;
  text-align: center;
}

.unsupported-view-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  margin-bottom: 0.25rem;
  border-radius: 50%;
  background-color: color-mix(in srgb, var(--view-color) 12%, transparent);
  color: var(--view-color);
}

.unsupported-view-icon .pi {
  font-size: 1.25rem;
}

.unsupported-view-title {
  margin: 0;
  color: var(--p-text-color);
  font-weight: 600;
}

.unsupported-view-text {
  margin: 0;
  color: var(--p-text-muted-color);
  font-size: 0.875rem;
}

.unsupported-view-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.25rem;
}

.unsupported-view-action-icon {
  font-size: 0.875rem;
}

.unsupported-view-action-image {
  width: 0.875rem;
  height: 0.875rem;
  background-color: currentColor;
  mask-position: center;
  mask-repeat: no-repeat;
  mask-size: contain;
}
</style>
