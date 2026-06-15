<template>
  <Teleport
    v-if="chatEmbedGlobalTarget && configStore.config.enableChatEmbed && globalStatusTable"
    :to="chatEmbedGlobalTarget"
  >
    <div :class="['acu-chat-embed', appClasses]" @click.stop>
      <div class="acu-embed-section">
        <GlobalStatusWidget
          :table-data="globalStatusTable"
          :is-editing="false"
          @row-click="row => globalStatusTable && emit('row-click', globalStatusTable.id, row)"
        />
      </div>
    </div>
  </Teleport>

  <Teleport
    v-if="chatEmbedOptionsTarget && configStore.config.enableChatEmbed && hasEmbedOptionsContent"
    :to="chatEmbedOptionsTarget"
  >
    <div :class="['acu-chat-embed', appClasses]" @click.stop>
      <div class="acu-embed-section">
        <div class="acu-embed-header" @click.stop="toggleEmbedOptionsCollapse">
          <div class="acu-embed-title">
            <i class="fas fa-hand-pointer"></i>
            <span>行动选项</span>
          </div>
          <i
            :class="['fas', embedOptionsCollapsed ? 'fa-chevron-down' : 'fa-chevron-up']"
            style="color: var(--acu-text-sub)"
          ></i>
        </div>
        <div v-show="!embedOptionsCollapsed" class="acu-embed-body">
          <InteractionTableWidget
            v-if="embedInteractionWidget && embedInteractionTable"
            :config="embedInteractionWidget"
            :table-data="embedInteractionTable"
            :is-editing="false"
            :diff-map="dataStore.diffMap"
            :ai-diff-map="dataStore.aiDiffMap"
            :search-term="''"
            @row-edit="(tableId, row) => emit('row-edit', tableId, row)"
            @action="(actionId, tableId) => emit('action', actionId, tableId)"
          />
          <EmbeddedOptionsPanel v-else :tables="optionsTables" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
import { toRef } from 'vue';
import EmbeddedOptionsPanel from '../dashboard/EmbeddedOptionsPanel.vue';
import GlobalStatusWidget from '../dashboard/GlobalStatusWidget.vue';
import InteractionTableWidget from '../dashboard/InteractionTableWidget.vue';
import { useChatAreaEmbed } from '../../composables/useChatAreaEmbed';
import { useChatEmbedContent } from '../../composables/useChatEmbedContent';
import { useConfigStore } from '../../stores/useConfigStore';
import { useDataStore } from '../../stores/useDataStore';
import type { ProcessedTable, TableRow } from '../../types';

const props = defineProps<{
  processedTables: ProcessedTable[];
  optionsTables: ProcessedTable[];
  appClasses: unknown;
}>();

const emit = defineEmits<{
  'row-click': [tableId: string, row: TableRow];
  'row-edit': [tableId: string, row: TableRow];
  action: [actionId: string, tableId: string];
}>();

const configStore = useConfigStore();
const dataStore = useDataStore();
const { embedTargets } = useChatAreaEmbed();
const chatEmbedGlobalTarget = embedTargets.global;
const chatEmbedOptionsTarget = embedTargets.options;

const {
  embedOptionsCollapsed,
  toggleEmbedOptionsCollapse,
  globalStatusTable,
  embedInteractionTable,
  embedInteractionWidget,
  hasEmbedOptionsContent,
} = useChatEmbedContent(toRef(props, 'processedTables'), toRef(props, 'optionsTables'));
</script>
