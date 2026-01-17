<template>
  <div class="rednote-homepage-post">
    <div
      class="rednote-homepage-post-img"
      :style="`background-color:${props.cardContent.imgColor};color:${props.cardContent.textColor};`"
    >
      {{ props.cardContent.img }}
    </div>
    <div class="rednote-homepage-post-info">
      <div class="rednote-homepage-post-title">{{ props.cardContent.title }}</div>
      <div class="rednote-homepage-post-author">
        <div
          :style="`background-image: url('${props.cardContent.head}');
                  width: 25px;
                  height: 25px;
                  border-radius: 50%;
                  background-size: cover;
                  background-position: top center;
                  background-repeat: no-repeat;
                  background-color: black;
                  aspect-ratio: 1;
                  min-width: 25px;`"
        ></div>
        <div
          style="
            color: rgb(100, 100, 100);
            font-size: 14px;
            flex: 1;
            text-overflow: ellipsis;
            overflow: hidden;
            white-space: nowrap;
          "
        >
          {{ props.cardContent.sender }}
        </div>
        <svg viewBox="0 0 1024 1024" width="20" height="20">
          <path
            d="M171.712 571.648l0.352 0.32 287.904 252.8a64 64 0 0 0 82.912 1.344l296.832-244.544a215.584 215.584 0 1 0-301.824-300.576L512 316.672l-25.888-35.616a215.584 215.584 0 1 0-314.4 290.624zM32 407.584a279.584 279.584 0 0 1 480-194.944 279.584 279.584 0 0 1 480 194.944 278.144 278.144 0 0 1-113.024 224.512l-295.36 243.392a128 128 0 0 1-165.888-2.592L129.984 620.16A278.976 278.976 0 0 1 32 407.584z"
            fill="#646464"
            p-id="4875"
          ></path>
        </svg>
        <div style="color: #646464; font-size: 12px">{{ props.cardContent.like }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { sharedState } from '../shared-state';
const props = defineProps(['cardContent']);
</script>
