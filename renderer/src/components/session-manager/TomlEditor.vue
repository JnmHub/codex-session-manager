<template>
  <div class="toml-editor">
    <section class="toml-pane">
      <div class="pane-title">编辑</div>
      <ElInput
        v-model="value"
        type="textarea"
        resize="none"
        class="toml-textarea"
        :rows="rows"
        :placeholder="placeholder"
        spellcheck="false"
      />
    </section>
    <section class="toml-pane preview-pane">
      <div class="pane-title">高亮预览</div>
      <ElScrollbar class="toml-preview-scroll">
        <pre class="toml-preview"><code v-html="highlighted"></code></pre>
      </ElScrollbar>
    </section>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'
  import hljs from 'highlight.js/lib/core'
  import ini from 'highlight.js/lib/languages/ini'

  hljs.registerLanguage('ini', ini)

  const props = withDefaults(defineProps<{
    modelValue: string
    rows?: number
    placeholder?: string
  }>(), {
    rows: 22,
    placeholder: ''
  })

  const emit = defineEmits<{
    (event: 'update:modelValue', value: string): void
  }>()

  const value = computed({
    get: () => props.modelValue,
    set: (next: string) => emit('update:modelValue', next)
  })

  const highlighted = computed(() => {
    return hljs.highlight(props.modelValue || ' ', { language: 'ini' }).value
  })
</script>

<style scoped lang="scss">
  .toml-editor {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 12px;
    min-height: 0;
  }

  .toml-pane {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--art-card-border);
    border-radius: 8px;
    background: var(--default-box-color);
  }

  .pane-title {
    height: 38px;
    padding: 0 12px;
    border-bottom: 1px solid var(--art-card-border);
    color: var(--art-gray-700);
    font-size: 13px;
    font-weight: 600;
    line-height: 38px;
    background: var(--default-bg-color);
  }

  .toml-textarea {
    min-height: 0;

    :deep(.el-textarea__inner) {
      height: 100%;
      min-height: 100% !important;
      border: 0;
      border-radius: 0;
      box-shadow: none;
      color: var(--art-gray-900);
      background: var(--default-box-color) !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
      line-height: 1.65;
      white-space: pre;
    }
  }

  .toml-preview-scroll {
    min-height: 0;
    background: var(--default-bg-color);
  }

  .toml-preview {
    min-height: 100%;
    margin: 0;
    padding: 12px 14px;
    color: var(--art-gray-900);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.65;
    white-space: pre;
  }

  :deep(.hljs-section) {
    color: #7c3aed;
    font-weight: 700;
  }

  :deep(.hljs-attr) {
    color: #0369a1;
  }

  :deep(.hljs-string) {
    color: #047857;
  }

  :deep(.hljs-number),
  :deep(.hljs-literal) {
    color: #c2410c;
  }

  :deep(.hljs-comment) {
    color: #94a3b8;
    font-style: italic;
  }

  :global(html.dark) .toml-pane,
  :global(.dark) .toml-pane {
    border-color: #334155;
    background: var(--default-box-color);
  }

  :global(html.dark) .pane-title,
  :global(.dark) .pane-title {
    border-bottom-color: #334155;
    color: #cbd5e1;
    background: var(--default-bg-color);
  }

  :global(html.dark) .toml-textarea :deep(.el-textarea__inner),
  :global(.dark) .toml-textarea :deep(.el-textarea__inner) {
    color: #d1d5db;
    background: var(--default-box-color) !important;
  }

  :global(html.dark) .toml-textarea :deep(.el-textarea__inner::placeholder),
  :global(.dark) .toml-textarea :deep(.el-textarea__inner::placeholder) {
    color: #64748b;
  }

  :global(html.dark) .toml-preview-scroll,
  :global(.dark) .toml-preview-scroll {
    background: var(--default-bg-color);
  }

  :global(html.dark) .toml-preview,
  :global(.dark) .toml-preview {
    color: #d1d5db;
  }

  :global(html.dark) :deep(.hljs-section),
  :global(.dark) :deep(.hljs-section) {
    color: #c4b5fd;
  }

  :global(html.dark) :deep(.hljs-attr),
  :global(.dark) :deep(.hljs-attr) {
    color: #7dd3fc;
  }

  :global(html.dark) :deep(.hljs-string),
  :global(.dark) :deep(.hljs-string) {
    color: #86efac;
  }

  :global(html.dark) :deep(.hljs-number),
  :global(html.dark) :deep(.hljs-literal),
  :global(.dark) :deep(.hljs-number),
  :global(.dark) :deep(.hljs-literal) {
    color: #fdba74;
  }

  :global(html.dark) :deep(.hljs-comment),
  :global(.dark) :deep(.hljs-comment) {
    color: #64748b;
  }

  @media (width <= 1100px) {
    .toml-editor {
      grid-template-columns: 1fr;
    }

    .preview-pane {
      min-height: 280px;
    }
  }
</style>
