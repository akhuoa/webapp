<template>
  <section class="property-editor">
    <h3 class="opencor-section-title opencor-section-title-small">{{ name }}</h3>
    <div class="property-editor-fields">
      <InputScientificNumberWidget v-for="(property, index) in properties" :key="property.property"
        :ref="(element: unknown) => (fieldRefs[index] = element as IInputScientificNumberWidget | null)"
        :modelValue="property.value"
        :label="hasUnits && property.unit ? `${property.property} (${property.unit})` : property.property"
        :disabled="disabled"
        size="small"
        @update:modelValue="(newValue: number | undefined) => onValueUpdated(index, newValue)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    name: string;
    disabled?: boolean;
    hasUnits?: boolean;
    properties: {
      property: string;
      value: number;
      unit?: string;
    }[];
    isValid?: (index: number, newValue: number) => boolean;
  }>(),
  {
    hasUnits: true
  }
);

const emit = defineEmits<{
  propertyUpdated: [index: number, newValue: number];
}>();

// The input fields of our properties, which we use to have a property's input field show its current value again when
// its new value is invalid.
// Note: an input field shows the value that was entered (or spun to), even if it doesn't get accepted, so we need to
//       ask it to show the current value of its property again, which it does without losing the keyboard focus (so
//       that, for instance, the user can keep spinning its value).

interface IInputScientificNumberWidget {
  discardEdit: () => void;
}

const fieldRefs: (IInputScientificNumberWidget | null)[] = [];

const onValueUpdated = (index: number, newValue: number | undefined): void => {
  // Ignore an invalid new value for the property, i.e. keep its current value. A new value is invalid if it is not a
  // finite number or if it is deemed invalid by our owner.

  const property = props.properties[index];

  if (!property || newValue === property.value) {
    return;
  }

  if (
    typeof newValue !== 'number' ||
    !Number.isFinite(newValue) ||
    (props.isValid && !props.isValid(index, newValue))
  ) {
    fieldRefs[index]?.discardEdit();

    return;
  }

  property.value = newValue;

  emit('propertyUpdated', index, newValue);
};
</script>

<style scoped>
.property-editor {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.property-editor-fields {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding-top: 0.375rem;
}
</style>
