<script setup>
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useApplicationStore } from '../../stores/application'
import WizardShell from '../../components/WizardShell.vue'
import Step1BasicInfo from './Step1BasicInfo.vue'
import Step2HowYouFoundUs from './Step2HowYouFoundUs.vue'
import Step3ProgramsAwards from './Step3ProgramsAwards.vue'
import StepPlaceholder from './StepPlaceholder.vue'

const route = useRoute()
const store = useApplicationStore()

const step = computed(() => Number(route.params.step))

// Keeps the persisted draft's currentStep in sync with whatever step the
// URL actually shows -- covers direct navigation to an /apply/:step URL
// and browser back/forward, not just the Continue button (which also sets
// this itself, ahead of the route change).
watch(step, (value) => {
  store.currentStep = value
}, { immediate: true })
</script>

<template>
  <WizardShell :step="step">
    <Step1BasicInfo v-if="step === 1" />
    <Step2HowYouFoundUs v-else-if="step === 2" />
    <Step3ProgramsAwards v-else-if="step === 3" />
    <StepPlaceholder v-else :step="step" />
  </WizardShell>
</template>
