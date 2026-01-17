<template>
  <transition name="slide-fade">
    <div
      v-if="props.value.chartype != 'npc'"
      class="QQ_chat_page"
      :style="`width: 100%; height: 100%; padding-top: 0px;${backgroundImg}`"
    >
      <div style="padding-top: 7px; backdrop-filter: blur(1px); background-color: rgb(255, 255, 255, 0.1)">
        <div
          style="
            width: 100%;
            height: 20px;
            display: grid;
            top: 0;
            left: 0;
            grid-template-columns: auto 1fr auto;
            align-items: center;
            margin-top: 20px;
          "
        >
          <svg
            @click="returnHome"
            class="QQ-close-btn"
            viewBox="0 0 1024 1024"
            style="height: 14px; width: 14px; margin-left: 8px"
          >
            <path
              d="M769.137778 153.372444L444.984889 512l324.152889 358.684444c36.408889 35.043556 36.408889 91.989333 0 126.976a95.744 95.744 0 0 1-131.868445 0l-377.571555-417.678222c-1.536-1.365333-3.584-1.877333-5.063111-3.299555A87.438222 87.438222 0 0 1 227.555556 512c-0.341333-23.324444 8.533333-46.876444 27.079111-64.739556 1.479111-1.422222 3.527111-1.934222 5.063111-3.185777L637.269333 26.339556a95.744 95.744 0 0 1 131.868445 0c36.408889 35.043556 36.408889 91.932444 0 127.032888z"
              fill="#666666"
              p-id="1570"
            ></path>
          </svg>
          <div style="display: flex; align-items: center; max-width: 100%; overflow: hidden; margin-left: 5px">
            <div
              v-show="sharedState.QQ.allUnRead > 0"
              class="new_tips"
              style="
                background-color: gray;
                color: #fff;
                width: 20px;
                height: 20px;
                border-radius: 50%;
                justify-content: center;
                align-items: center;
                font-size: 12px;
                display: flex;
              "
            >
              {{ sharedState.QQ.allUnRead }}
            </div>
            <span class="QQ_chat_username">{{ props.value.name }}</span>
          </div>
          <svg
            @click="openSetting"
            id="QQ_chat_page_setting"
            viewBox="0 0 1024 1024"
            style="height: 15px; width: 15px; margin-right: 14px"
          >
            <path
              d="M901.632 896H122.368c-30.72 0-55.808-25.088-55.808-55.808v-1.536c0-30.72 25.088-55.808 55.808-55.808h779.776c30.72 0 55.808 25.088 55.808 55.808v1.536c-0.512 30.72-25.6 55.808-56.32 55.808zM901.632 568.32H122.368c-30.72 0-55.808-25.088-55.808-55.808v-1.536c0-30.72 25.088-55.808 55.808-55.808h779.776c30.72 0 55.808 25.088 55.808 55.808v1.536c-0.512 30.72-25.6 55.808-56.32 55.808zM901.632 240.64H122.368c-30.72 0-55.808-25.088-55.808-55.808v-1.536c0-30.72 25.088-55.808 55.808-55.808h779.776c30.72 0 55.808 25.088 55.808 55.808v1.536c-0.512 30.72-25.6 55.808-56.32 55.808z"
              p-id="4301"
              fill="#666666"
            ></path>
          </svg>
        </div>
        <div
          style="width: 100%; height: 0.5px; background-color: #eee; margin-top: 5px; border-top: 1px solid #9a9a9a"
        ></div>
      </div>
      <div
        @click="
          containerShow.show = false;
          containerShow.showtype = '';
          isIncrease = false;
        "
        ref="msgContentRef"
        class="msgcontent"
        :style="{ marginBottom: computedMargin }"
        style="padding-top: 15px; padding-bottom: 0"
      >
        <bubble
          v-for="msg in sharedState.QQ.chathistory[props.name]?.msgs || []"
          :bubble="msg"
          :isGroup="sharedState.QQ.chathistory[props.name]?.chartype"
          :senderinfo="sharedState.QQ.chars[msg?.sender]"
        ></bubble>
      </div>
      <!-- <div
        style="display: none"
        v-if="inputShow"
        class="input-container"
        :style="`background-color:${sharedState.QQ.chars[props.name].inputColor}`"
      >
        <div style="display: flex; align-items: center; width: 100%">
          <div style="flex-grow: 1; margin-left: 5px; margin-right: 2%">
            <input
              v-model="text_value"
              @keyup.enter="sendText(false)"
              class="userInput"
              type="text"
              name=""
              style="
                box-sizing: border-box;
                background-color: transparent;
                background-color: unset !important;
                border: 1px solid rgb(0, 0, 0, 0.5) !important;
                color: black !important;
              "
            />
          </div>
          <div @click="sendText(true)" style="margin-right: 7px" id="QQ_chat_send-btn">
            <button
              style="
                background-color: #fff;
                border-radius: 10px;
                height: 31px;
                display: block;
                width: 3.5rem;
                background-color: transparent;
                border: 1px solid rgb(0, 0, 0, 0.5);
                color: black !important;
              "
            >
              发送
            </button>
          </div>
        </div>
        <div class="QQ_chatpage_function">
          <svg
            @click="function_click('voice')"
            :class="`QQ_chatpage_function_voice${containerShow.showtype == 'voice' ? ' svg_selected' : ''}`"
            viewBox="0 0 1024 1024"
            width="28"
            height="25"
          >
            <path
              d="M320.093091 234.682182a191.906909 191.906909 0 1 1 383.813818 0V512a191.906909 191.906909 0 1 1-383.813818 0V234.682182zM512 127.906909a106.728727 106.728727 0 0 0-106.728727 106.775273V512a106.728727 106.728727 0 1 0 213.457454 0V234.682182A106.728727 106.728727 0 0 0 512 127.906909zM192 448.093091c23.505455 0 42.589091 19.083636 42.589091 42.589091a277.410909 277.410909 0 0 0 554.821818 0 42.589091 42.589091 0 0 1 85.178182 0 362.589091 362.589091 0 0 1-320 360.122182v87.877818a42.589091 42.589091 0 0 1-85.178182 0v-87.924364a362.635636 362.635636 0 0 1-320-360.075636c0-23.552 19.083636-42.589091 42.589091-42.589091z"
              p-id="8419"
            ></path>
          </svg>
          <svg
            @click="function_click('img')"
            :class="`QQ_chatpage_function_img${containerShow.showtype == 'img' ? ' svg_selected' : ''}`"
            viewBox="0 0 1024 1024"
            width="28"
            height="28"
          >
            <path
              d="M938.666667 553.92V768c0 64.8-52.533333 117.333333-117.333334 117.333333H202.666667c-64.8 0-117.333333-52.533333-117.333334-117.333333V256c0-64.8 52.533333-117.333333 117.333334-117.333333h618.666666c64.8 0 117.333333 52.533333 117.333334 117.333333v297.92z m-64-74.624V256a53.333333 53.333333 0 0 0-53.333334-53.333333H202.666667a53.333333 53.333333 0 0 0-53.333334 53.333333v344.48A290.090667 290.090667 0 0 1 192 597.333333a286.88 286.88 0 0 1 183.296 65.845334C427.029333 528.384 556.906667 437.333333 704 437.333333c65.706667 0 126.997333 16.778667 170.666667 41.962667z m0 82.24c-5.333333-8.32-21.130667-21.653333-43.648-32.917333C796.768 511.488 753.045333 501.333333 704 501.333333c-121.770667 0-229.130667 76.266667-270.432 188.693334-2.730667 7.445333-7.402667 20.32-13.994667 38.581333-7.68 21.301333-34.453333 28.106667-51.370666 13.056-16.437333-14.634667-28.554667-25.066667-36.138667-31.146667A222.890667 222.890667 0 0 0 192 661.333333c-14.464 0-28.725333 1.365333-42.666667 4.053334V768a53.333333 53.333333 0 0 0 53.333334 53.333333h618.666666a53.333333 53.333333 0 0 0 53.333334-53.333333V561.525333zM320 480a96 96 0 1 1 0-192 96 96 0 0 1 0 192z m0-64a32 32 0 1 0 0-64 32 32 0 0 0 0 64z"
              p-id="10905"
            ></path>
          </svg>
          <svg class="QQ_chatpage_function_camera" viewBox="0 0 1024 1024" width="28" height="28">
            <path
              d="M269.44 256l23.296-75.381333A74.666667 74.666667 0 0 1 364.074667 128h295.850666a74.666667 74.666667 0 0 1 71.338667 52.618667L754.56 256H821.333333c64.8 0 117.333333 52.533333 117.333334 117.333333v426.666667c0 64.8-52.533333 117.333333-117.333334 117.333333H202.666667c-64.8 0-117.333333-52.533333-117.333334-117.333333V373.333333c0-64.8 52.533333-117.333333 117.333334-117.333333h66.773333z m23.605333 64H202.666667a53.333333 53.333333 0 0 0-53.333334 53.333333v426.666667a53.333333 53.333333 0 0 0 53.333334 53.333333h618.666666a53.333333 53.333333 0 0 0 53.333334-53.333333V373.333333a53.333333 53.333333 0 0 0-53.333334-53.333333h-90.378666a32 32 0 0 1-30.570667-22.549333l-30.272-97.930667a10.666667 10.666667 0 0 0-10.186667-7.52H364.074667a10.666667 10.666667 0 0 0-10.186667 7.52l-30.272 97.92A32 32 0 0 1 293.045333 320zM512 725.333333c-88.362667 0-160-71.637333-160-160 0-88.362667 71.637333-160 160-160 88.362667 0 160 71.637333 160 160 0 88.362667-71.637333 160-160 160z m0-64a96 96 0 1 0 0-192 96 96 0 0 0 0 192z"
              p-id="6401"
            ></path>
          </svg>
          <svg
            @click="function_click('transfer')"
            :class="`QQ_chatpage_function_redpacket${containerShow.showtype == 'transfer' ? ' svg_selected' : ''}`"
            viewBox="0 0 1024 1024"
            p-id="12169"
            width="28"
            height="28"
          >
            <path
              d="M827 357.60909131a522.16363653 522.16363653 0 0 1-159.83181826 81.9 155.45454521 155.45454521 0 0 1-310.33636348 0A522.16363653 522.16363653 0 0 1 197 357.60909131V798.36363652A90 90 0 0 0 287 888.36363653h450a90 90 0 0 0 90-90V357.60909131z m0-85.58181826V225.63636348A90 90 0 0 0 737 135.63636347H287A90 90 0 0 0 197 225.63636348v46.34999999a457.93636347 457.93636347 0 0 0 169.97727305 102.06818174 155.49545479 155.49545479 0 0 1 290.0454539 0A457.89545479 457.89545479 0 0 0 827 272.02727305zM287 70.18181826h450A155.45454521 155.45454521 0 0 1 892.45454521 225.63636348v572.72727304a155.45454521 155.45454521 0 0 1-155.45454521 155.45454522H287A155.45454521 155.45454521 0 0 1 131.54545479 798.36363652V225.63636348A155.45454521 155.45454521 0 0 1 287 70.18181826z m225 450a90 90 0 1 0 0-180 90 90 0 0 0 0 180z"
              p-id="12170"
            ></path>
          </svg>
          <svg
            @click="function_click('emoji')"
            :class="`QQ_chatpage_function_emoji${containerShow.showtype == 'emoji' ? ' svg_selected' : ''}`"
            viewBox="0 0 1024 1024"
            p-id="13480"
            width="28"
            height="28"
          >
            <path
              d="M512 64a448 448 0 1 1 0 896A448 448 0 0 1 512 64z m0 64a384 384 0 1 0 0 768A384 384 0 0 0 512 128zM282.624 611.2H351.36c35.52 60.416 82.112 96.128 160.64 96.128 73.92 0 117.888-27.072 155.008-84.928l6.848-11.2h67.52a246.208 246.208 0 0 1-453.76 11.84l-4.992-11.84H351.36z m387.2-251.264a48 48 0 1 1 0 96 48 48 0 0 1 0-96z m-315.2 0a48 48 0 1 1 0 96 48 48 0 0 1 0-96z"
              p-id="13481"
            ></path>
          </svg>
          <svg class="QQ_chatpage_function_other" viewBox="0 0 1024 1024" p-id="14615" width="28" height="28">
            <path
              d="M512 958.016611c-119.648434 0-232.1288-46.367961-316.736783-130.559656-84.640667-84.255342-131.263217-196.255772-131.263217-315.455235 0-119.168499 46.624271-231.199892 131.232254-315.424271 84.607983-84.191695 197.088348-130.559656 316.736783-130.559656s232.1288 46.367961 316.704099 130.559656c84.67163 84.224378 131.263217 196.255772 131.263217 315.391587 0.032684 119.199462-46.591587 231.232576-131.263217 315.455235C744.1288 911.615966 631.648434 958.016611 512 958.016611zM512 129.983389c-102.623626 0-199.071738 39.743475-271.583282 111.936783-72.480581 72.12794-112.416718 168.063432-112.416718 270.079828s39.903454 197.951888 112.384034 270.047144c72.511544 72.191587 168.959656 111.936783 271.583282 111.936783 102.592662 0 199.071738-39.743475 271.583282-111.936783 72.480581-72.160624 112.416718-168.063432 112.384034-270.079828 0-102.016396-39.903454-197.919204-112.384034-270.016181C711.071738 169.759548 614.592662 129.983389 512 129.983389z"
              p-id="14616"
            ></path>
            <path
              d="M736.00086 480.00086 544.00086 480.00086 544.00086 288.00086c0-17.664722-14.336138-32.00086-32.00086-32.00086s-32.00086 14.336138-32.00086 32.00086l0 192L288.00086 480.00086c-17.664722 0-32.00086 14.336138-32.00086 32.00086s14.336138 32.00086 32.00086 32.00086l192 0 0 192c0 17.695686 14.336138 32.00086 32.00086 32.00086s32.00086-14.303454 32.00086-32.00086L544.00258 544.00086l192 0c17.695686 0 32.00086-14.336138 32.00086-32.00086S753.696546 480.00086 736.00086 480.00086z"
              p-id="14617"
            ></path>
          </svg>
        </div>
        <div class="drawer-wrap" :class="{ open: containerShow.show }">
          <transition name="drawer">
            <div
              v-show="containerShow.show"
              class="chat_function_container"
              style="width: 100%; height: 250px; margin-top: 5px; border-top: #d7d5d5 1px solid"
            >
              <div v-show="containerShow.showtype == 'emoji'" class="emoji_container">
                <img
                  v-for="(value, key) in sharedState.emoji"
                  @click="sendEmoji(value, key)"
                  :data-name="key"
                  :src="value"
                  alt="加载失败"
                  loading="lazy"
                  class="emoji_container_img"
                />
              </div>
              <div
                v-show="containerShow.showtype == 'voice' || containerShow.showtype == 'img'"
                class="input_container"
              >
                <span>文字描述:</span>
                <input v-model="specialText" type="text" placeholder="发送内容的文字描述" />
                <button @click="sendSpecial" class="chat_function_input_container_button">确定</button>
              </div>
              <div v-show="containerShow.showtype == 'transfer'" class="input_container">
                <span>给对方转账:</span>
                <input v-model="specialText" type="text" placeholder="输入转账金额,无需单位" />
                <button @click="sendSpecial" class="chat_function_input_container_button">确定转账</button>
              </div>
            </div>
          </transition>
        </div>
      </div> -->
      <footer
        v-if="inputShow"
        class="chat-bar-wrap"
        :class="{ 'is-mobile': sharedState.ST.isMobile }"
        role="contentinfo"
        aria-label="聊天输入栏"
        :style="`background-color:${sharedState.QQ.chars[props.name].inputColor || '#f2f3f5'}`"
      >
        <div class="chat-bar" aria-label="输入工具栏">
          <!-- 加号：更多功能入口 -->
          <button @click="special.show = !special.show" class="icon-btn" aria-label="更多功能">
            <svg
              class="icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>

          <!-- 输入框主体 -->
          <div
            class="input-shell"
            style="
              flex: 1 !important;
              display: flex !important;
              align-items: center !important;
              background: #ffffff !important;
              border-radius: 8px !important;
              padding: 10px 12px !important;
              box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04) !important;
              min-width: 0 !important;
            "
          >
            <!-- input本体：先清空继承，再设定所需样式 -->
            <input
              id="messageInput"
              @keyup.enter="sendText(false)"
              v-model="text_value"
              placeholder="输入消息…"
              style="
                all: unset !important; /* 清空全局影响 */
                box-sizing: border-box !important;
                display: block !important;
                width: 100% !important;
                font-size: 15px !important;
                line-height: 20px !important;
                color: #333 !important;
                background: transparent !important;
                caret-color: #4a90e2 !important; /* 光标颜色可选 */
              "
            />
          </div>

          <!-- 表情按钮（在右边，与发送键同侧） -->
          <button @click="function_click('emoji')" class="icon-btn" aria-label="表情">
            <svg
              class="icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M8 10h.01M16 10h.01" />
              <path d="M8.5 15c1 .8 2.2 1.2 3.5 1.2s2.5-.4 3.5-1.2" />
            </svg>
          </button>

          <!-- 发送按钮（始终可见；输入为空时置灰）:disabled="!text_value.trim()" -->
          <button
            @click="sendText(true)"
            :class="{ active: isAnimating }"
            class="send-btn"
            id="sendBtn"
            aria-label="发送"
          >
            <svg
              class="plane"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m22 2-7 20-3-9-9-3Z" />
              <path d="M22 2 11 13" />
            </svg>
          </button>
        </div>
        <div class="drawer-wrap" :class="{ open: containerShow.show }">
          <transition name="drawer">
            <div
              v-show="containerShow.show"
              class="chat_function_container"
              style="width: 100%; height: 250px; margin-top: 5px; border-top: #d7d5d5 1px solid"
            >
              <div v-show="containerShow.showtype == 'emoji'" class="emoji_container">
                <img
                  v-for="(value, key) in sharedState.emoji"
                  @click="sendEmoji(value, key)"
                  :data-name="key"
                  :src="value"
                  alt="加载失败"
                  loading="lazy"
                  class="emoji_container_img"
                />
              </div>
              <div
                v-show="containerShow.showtype == 'voice' || containerShow.showtype == 'img'"
                class="input_container"
              >
                <span>文字描述:</span>
                <input v-model="specialText" type="text" placeholder="发送内容的文字描述" />
                <button @click="sendSpecial" class="chat_function_input_container_button">确定</button>
              </div>
              <div v-show="containerShow.showtype == 'transfer'" class="input_container">
                <span>给对方转账:</span>
                <input v-model="specialText" type="text" placeholder="输入转账金额,无需单位" />
                <button @click="sendSpecial" class="chat_function_input_container_button">确定转账</button>
              </div>
            </div>
          </transition>
        </div>
      </footer>
      <transition name="popup">
        <div v-show="setting.enable && props.value.chartype != 'Group'" class="chat-setting-popup">
          <div class="chat-setting-header">
            <span>聊天设置</span>
            <svg @click="closeSetting(false)" class="close-setting-btn" viewBox="0 0 1024 1024" width="20" height="20">
              <path
                d="M512 421.490332 331.092592 240.582924C307.952518 217.442849 270.568889 217.442849 247.428814 240.582924 224.288739 263.722999 224.288739 301.106628 247.428814 324.246702L428.336222 505.154112 247.428814 686.061521C224.288739 709.201596 224.288739 746.585225 247.428814 769.7253 270.568889 792.865374 307.952518 792.865374 331.092592 769.7253L512 588.817891 692.907408 769.7253C716.047482 792.865374 753.431111 792.865374 776.571186 769.7253 799.711261 746.585225 799.711261 709.201596 776.571186 686.061521L595.663778 505.154112 776.571186 324.246702C799.711261 301.106628 799.711261 263.722999 776.571186 240.582924 753.431111 217.442849 716.047482 217.442849 692.907408 240.582924L512 421.490332Z"
                fill="#666666"
              ></path>
            </svg>
          </div>
          <div class="chat-setting-content">
            <div class="setting-item">
              <span>气泡颜色</span>
              <div style="flex: 1">
                <input
                  v-model="setting.bubble"
                  style="width: 100%"
                  type="text"
                  id="bubble-color-input"
                  placeholder="颜色值"
                />
              </div>
              <input v-model="setting.bubble" type="color" id="bubble-color" class="color-picker" />
            </div>
            <div class="setting-item">
              <span>字体颜色</span>
              <div style="flex: 1">
                <input
                  v-model="setting.text"
                  style="width: 100%"
                  type="text"
                  id="text-color-input"
                  placeholder="颜色值"
                />
              </div>
              <input v-model="setting.text" type="color" id="text-color" class="color-picker" />
            </div>
            <div class="setting-item">
              <span>输入框色</span>
              <div style="flex: 1">
                <input
                  v-model="setting.inputColor"
                  style="width: 100%"
                  type="text"
                  id="text-color-input"
                  placeholder="颜色值"
                />
              </div>
              <input v-model="setting.inputColor" type="color" id="text-color" class="color-picker" />
            </div>
            <div class="setting-item" v-if="props.value.chartype == 'friend'">
              <span>角色备注</span>
              <div style="flex: 1">
                <input
                  v-model="setting.name"
                  style="width: 100%"
                  type="text"
                  id="chatbg-input"
                  placeholder="对角色的备注"
                />
              </div>
              <button style="display: none" class="pickfile-setting-btn" data-id="bg">选择文件</button>
            </div>
            <div class="setting-item">
              <span>聊天壁纸</span>
              <div style="flex: 1">
                <input
                  v-model="setting.background"
                  style="width: 100%"
                  type="text"
                  id="chatbg-input"
                  placeholder="输入图片URL"
                />
              </div>
              <button style="display: none" class="pickfile-setting-btn" data-id="bg">选择文件</button>
            </div>
            <div class="setting-item">
              <span>聊天头像</span>
              <div style="flex: 1">
                <input
                  v-model="setting.head"
                  style="width: 100%"
                  type="text"
                  id="chathead-input"
                  placeholder="输入图片URL"
                />
              </div>
              <button style="display: none" class="pickfile-setting-btn" data-id="head">选择文件</button>
            </div>
            <div class="setting-item">
              <span>使用机型</span>
              <div style="flex: 1">
                <input
                  v-model="setting.phone"
                  style="width: 100%"
                  type="text"
                  id="chathead-input"
                  placeholder="输入手机型号"
                />
              </div>
              <button style="display: none" class="pickfile-setting-btn" data-id="head">选择文件</button>
            </div>
            <div class="preview" style="margin: 0 auto">
              <div
                class="QQ_chat_msgdiv"
                id="chat-setting-preview"
                data-name="${username}"
                :style="{
                  margin: '0 auto',
                  'background-color': setting.bubble,
                  color: setting.text,
                }"
              >
                <span>这是预览文本</span>
              </div>
            </div>
            <input id="pickfile-input" type="file" accept="image/*" capture="camera" style="display: none" />
          </div>
          <div class="chat-setting-footer">
            <button @click="randomColor" id="randomcolor-setting-btn" style="background-color: #919bec; color: white">
              随机
            </button>
            <button @click="closeSetting(true)" id="save-setting-btn">保存</button>
            <button @click="closeSetting(false)" id="cancel-setting-btn">取消</button>
          </div>
          <div style="font-size: 14px; color: gray; margin-left: 10px; margin-bottom: 5px">
            聊天头像输入'char'就是用卡封面当头像
          </div>
          <div style="font-size: 14px; color: gray; margin-left: 10px; margin-bottom: 5px">
            输入框颜色留空（就是不输入）就是透明
          </div>
        </div>
      </transition>

      <transition name="popup">
        <div v-show="special.show" class="chat-setting-popup">
          <div class="chat-setting-header">
            <span>特殊功能</span>
            <svg @click="special.show = false" class="close-setting-btn" viewBox="0 0 1024 1024" width="20" height="20">
              <path
                d="M512 421.490332 331.092592 240.582924C307.952518 217.442849 270.568889 217.442849 247.428814 240.582924 224.288739 263.722999 224.288739 301.106628 247.428814 324.246702L428.336222 505.154112 247.428814 686.061521C224.288739 709.201596 224.288739 746.585225 247.428814 769.7253 270.568889 792.865374 307.952518 792.865374 331.092592 769.7253L512 588.817891 692.907408 769.7253C716.047482 792.865374 753.431111 792.865374 776.571186 769.7253 799.711261 746.585225 799.711261 709.201596 776.571186 686.061521L595.663778 505.154112 776.571186 324.246702C799.711261 301.106628 799.711261 263.722999 776.571186 240.582924 753.431111 217.442849 716.047482 217.442849 692.907408 240.582924L512 421.490332Z"
                fill="#666666"
              ></path>
            </svg>
          </div>
          <div class="chat-setting-content">
            <div class="setting-item">
              <span>语音</span>
              <div style="flex: 1">
                <input v-model="special.text.voice" style="width: 100%" type="text" placeholder="语音文字内容" />
              </div>
              <button @click="sendSpecial('voice')" class="pickfile-setting-btn" data-id="bg">发送</button>
            </div>
            <div class="setting-item">
              <span>图片</span>
              <div style="flex: 1">
                <input v-model="special.text.img" style="width: 100%" type="text" placeholder="图片文字描述" />
              </div>
              <button @click="sendSpecial('img')" class="pickfile-setting-btn" data-id="bg">发送</button>
            </div>
            <div class="setting-item">
              <span>转账</span>
              <div style="flex: 1">
                <input v-model="special.text.transfer" style="width: 100%" type="text" placeholder="输入转账金额" />
              </div>
              <button @click="sendSpecial('transfer')" class="pickfile-setting-btn" data-id="bg">发送</button>
            </div>
          </div>
        </div>
      </transition>

      <transition name="popup">
        <div v-show="setting.enable && props.value.chartype == 'Group'" class="chat-setting-popup">
          <div class="chat-setting-header">
            <span>聊天设置</span>
            <svg @click="closeSetting(false)" class="close-setting-btn" viewBox="0 0 1024 1024" width="20" height="20">
              <path
                d="M512 421.490332 331.092592 240.582924C307.952518 217.442849 270.568889 217.442849 247.428814 240.582924 224.288739 263.722999 224.288739 301.106628 247.428814 324.246702L428.336222 505.154112 247.428814 686.061521C224.288739 709.201596 224.288739 746.585225 247.428814 769.7253 270.568889 792.865374 307.952518 792.865374 331.092592 769.7253L512 588.817891 692.907408 769.7253C716.047482 792.865374 753.431111 792.865374 776.571186 769.7253 799.711261 746.585225 799.711261 709.201596 776.571186 686.061521L595.663778 505.154112 776.571186 324.246702C799.711261 301.106628 799.711261 263.722999 776.571186 240.582924 753.431111 217.442849 716.047482 217.442849 692.907408 240.582924L512 421.490332Z"
                fill="#666666"
              ></path>
            </svg>
          </div>
          <div class="chat-setting-content">
            <div class="setting-item">
              <span>群名称</span>
              <div style="flex: 1">
                <input
                  v-model="groupSetting.name"
                  style="width: 100%"
                  type="text"
                  id="chathead-input"
                  placeholder="输入群名"
                />
              </div>
            </div>
            <div class="setting-item">
              <span>群壁纸</span>
              <div style="flex: 1">
                <input
                  v-model="setting.background"
                  style="width: 100%"
                  type="text"
                  id="chathead-input"
                  placeholder="聊天壁纸"
                />
              </div>
            </div>
            <div class="setting-item" style="align-items: start">
              <span style="margin-top: 5px">群成员</span>
              <div style="flex: 1">
                <textarea
                  v-model="groupSetting.members"
                  rows="4"
                  placeholder="告诉Ai群里都有谁，怎么输入都行没有格式规范，写个‘一群随机路人’进去也行"
                ></textarea>
              </div>
            </div>
            <div class="setting-item" style="align-items: start">
              <span style="margin-top: 5px">群说明</span>
              <div style="flex: 1">
                <textarea
                  v-model="groupSetting.content"
                  rows="4"
                  placeholder="告诉Ai角色们会在这里聊什么之类的，比如分享日常，聊八卦"
                ></textarea>
              </div>
            </div>
          </div>
          <div style="font-size: 14px; color: gray; margin-left: 10px; margin-bottom: 5px">
            点击保存后,会自动创建一个条目存放这些内容<br />
            默认为蓝灯D4,可在创建后自行修改<br />
            条目名称为：群聊{{ props.name }}
          </div>
          <div class="chat-setting-footer">
            <button
              @click="removeChar"
              id="randomcolor-setting-btn"
              style="background-color: rgb(243 112 112); color: white"
            >
              删除
            </button>
            <button @click="closeSettingGroup(true)" id="save-setting-btn">保存</button>
            <button @click="closeSettingGroup(false)" id="cancel-setting-btn">取消</button>
          </div>
        </div>
      </transition>

      <transition name="fade">
        <div v-show="setting.enable || special.show" class="popup-overlay"></div>
      </transition>
    </div>
  </transition>
</template>

<script setup>
import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue';
import { sharedState } from '../shared-state';
import bubble from './bubble/bubble.vue';

const props = defineProps(['value', 'name']);
const text_value = ref('');
const isAnimating = ref(false);
const msgContentRef = ref(null);
const currentMsgs = computed(() => sharedState.QQ.chathistory[props.name]?.msgs || []);
const setting = ref({
  enable: false,
  bubble: props.value.bubble || '#FFFFFF',
  text: props.value.text || '#000000',
  inputColor: props.value.inputColor || '#FFFFFF',
  head: props.value.head,
  background: props.value.background,
  phone: props.value?.phone || '隐藏机型',
  name: props.value.name || '',
});
const backupSetting = JSON.parse(JSON.stringify(setting.value));
const containerShow = ref({
  show: false,
  showtype: '',
});
const special = ref({
  show: false,
  msgtype: '',
  text: {
    voice: '',
    img: '',
    transfer: '',
  },
});
const backgroundImg = computed(() => {
  if (props.name in sharedState.QQ.chars) {
    let img = sharedState.QQ.chars[props.name].background;
    if (img) {
      return `background-image:url('${img}')`;
    } else {
      return '';
    }
  } else {
    console.log(`没有壁纸`);
    return '';
  }
});
const inputShow = computed(() => {
  if ('banSend' in props.value && props.value.banSend) {
    return false;
  } else {
    return true;
  }
});
const groupSetting = ref({
  name: '',
  content: '',
  members: '',
  entryName: `群聊${props.name}`,
});

function openSetting() {
  if (props.value.chartype == 'Group') {
    loadGroupSetting();
  }
  setting.value.enable = !setting.value.enable;
}

function loadGroupSetting() {
  const entry = sharedState.ST.getEntry([groupSetting.value.entryName], true);
  console.log(`读取世界书内容${groupSetting.value.entryName}`);
  if (!entry) {
    return;
  }
  console.log(entry.content);
  let yaml;
  try {
    yaml = YAML.parse(entry.content);
    groupSetting.value.name = yaml[groupSetting.value.entryName].群初始名称;
    groupSetting.value.content = yaml[groupSetting.value.entryName].群作用;
    groupSetting.value.members = yaml[groupSetting.value.entryName].群成员;
  } catch {
    console.log(`yaml解析失败`);
    return;
  }
}

// 定义你的变量（假设叫isIncrease，为true时增加margin-bottom）
const isIncrease = ref(false); // 你可以从props、store或其他地方设置这个值

// 定义增加的数值（单位px，你可以改成变量）
const extraMargin = 250;

// 计算margin-bottom的值
const computedMargin = computed(() => {
  return '0px';
  const base = 85; // 原有基础值
  return `${base + (isIncrease.value ? extraMargin : 0)}px`;
});

watch(
  // 同步变动设置界面里的值
  () => props.value,
  newValue => {
    setting.value.bubble = newValue.bubble;
    setting.value.text = newValue.text;
    setting.value.head = newValue.head;
    setting.value.background = newValue.background;
  },
  { deep: true },
); // 使用 deep: true 来侦听 props.value 对象内部属性的变化

watch(
  () => sharedState.QQ.chathistory[props.name]?.msgs?.length,
  newValue => {
    scrollToBottom();
  },
);

let ro = null;
let prevClientH = 0;
let suspendRO = false; // 程序化滚动时暂停 RO 改写
let pendingShowBaseline = false; // 从隐藏回显示后的第一次，仅同步基线
const visible = computed(() => props.value?.chartype !== 'npc');
function teardownObserver() {
  ro?.disconnect();
  ro = null;
}

function setupObserver() {
  const el = msgContentRef.value;
  if (!el) return; // ref 还没到位，直接返回

  // 先安全读取一次高度
  prevClientH = el.clientHeight || 0;

  // 每次重绑都先清理
  teardownObserver();

  ro = new ResizeObserver(() => {
    const el = msgContentRef.value;
    if (!el) return;

    if (el.clientHeight === 0) {
      pendingShowBaseline = true;
      return;
    }
    if (suspendRO) {
      prevClientH = el.clientHeight;
      return;
    }
    if (pendingShowBaseline) {
      pendingShowBaseline = false;
      prevClientH = el.clientHeight;
      return;
    }

    // 保底：如果已在底部就强贴底
    const atBottom = el.scrollHeight - (el.scrollTop + el.clientHeight) <= 20;
    if (atBottom) {
      el.scrollTop = el.scrollHeight - el.clientHeight;
      prevClientH = el.clientHeight;
      return;
    }

    // 非底部时保持 bottomGap 不变
    const bottomGap = el.scrollHeight - (el.scrollTop + prevClientH);
    el.scrollTop = el.scrollHeight - el.clientHeight - bottomGap;
    prevClientH = el.clientHeight;
  });

  ro.observe(el);
}

onMounted(async () => {
  // 等下一帧，确保过了 transition 初始渲染
  await nextTick();
  if (visible.value) setupObserver();
});

// 当 v-if 切换或 ref 变化时，动态（重）绑定/解绑
watch([visible, msgContentRef], async ([isVisible]) => {
  if (isVisible) {
    await nextTick();
    setupObserver();
  } else {
    teardownObserver();
  }
});

onBeforeUnmount(() => {
  teardownObserver();
});

// —— 其它函数里也加保险 ——
const scrollToBottom = () => {
  const el = msgContentRef.value;
  if (!el) return; // 防空
  suspendRO = true;
  nextTick(() => {
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      prevClientH = el.clientHeight || 0;
      requestAnimationFrame(() => {
        suspendRO = false;
      });
    });
  });
};

// 进入会话时滚到底
watch(
  () => sharedState.QQ.activeChatId,
  newId => {
    if (newId && newId === props.name) {
      scrollToBottom();
    }
  },
);

function returnHome() {
  sharedState.QQ.activeChatId = null;
}

function sendText(send) {
  const sendValue = text_value.value;
  if (sharedState.generate || !inputShow.value) {
    return;
  }
  text_value.value = '';
  const name = props.name;
  console.log(`给${name}发送消息:${sendValue}`);
  if (!sendValue.match(/\S/) && sharedState.QQ.cacheMsg.length == 0) {
    return;
  }

  isAnimating.value = true;
  setTimeout(() => (isAnimating.value = false), 120);

  if (name in sharedState.QQ.chathistory == false) {
    sharedState.QQ.chathistory[name] = {
      chartype: sharedState.QQ.chars[name].chartype == 'Group' ? 'Group' : 'private',
      msgs: [],
    };
  }

  if (sendValue) {
    sharedState.QQ.addMsg(name, {
      msgtype: 'text',
      content: sendValue,
      sender: 'user',
      time: '',
    });
  }

  const chartype = sharedState.QQ.chars[props.name]?.chartype;

  if (sharedState.phone.sendModel == '尾附') {
    let message = '';
    if (chartype == 'Group') {
      message += `\n在群聊${props.name}中发送消息:${sendValue}`;
    } else {
      message += `\n给${props.name}发送消息:${sendValue}`;
    }
    const old_content = $('#send_textarea').val().trim();
    const new_content = old_content + message;
    $('#send_textarea')
      .val(new_content.trim() || '')[0]
      .dispatchEvent(new Event('input', { bubbles: true }));
    sharedState.QQ.cacheMsg = [];
    return;
  }

  if (send) {
    let message = sharedState.QQ.cacheMsg.join('\n').trim();
    if (sendValue) {
      if (chartype == 'Group') {
        message += `\n在群聊${props.name}中发送消息:${sendValue}`;
      } else {
        message += `\n给${props.name}发送消息:${sendValue}`;
      }
    }
    sharedState.QQ.cacheMsg = [];
    triggerSlash(`/send ${message.trim()}|/trigger`);
  } else if (sendValue) {
    let message = '';
    if (chartype == 'Group') {
      message = `\n在群聊${props.name}中发送消息:${sendValue}`;
    } else {
      message = `\n给${props.name}发送消息:${sendValue}`;
    }
    sharedState.QQ.cacheMsg.push(message.trim());
  }

  // 不确定需不需要反正归零了就对了
  sharedState.QQ.chathistory[name].unread = 0;
}

function closeSetting(save) {
  setting.value.enable = false;
  if (!save) {
    setting.value = JSON.parse(JSON.stringify(backupSetting));
    return;
  }

  if (setting.value.text) {
    sharedState.QQ.chars[props.name].text = setting.value.text;
  }
  if (setting.value.bubble) {
    sharedState.QQ.chars[props.name].bubble = setting.value.bubble;
  }
  if (setting.value.head) {
    sharedState.QQ.chars[props.name].head = setting.value.head;
  }
  if (setting.value.background) {
    sharedState.QQ.chars[props.name].background = setting.value.background;
  }
  if (setting.value.phone) {
    sharedState.QQ.chars[props.name].phone = setting.value.phone;
  }
  if (props.value.chartype == 'friend' && setting.value.name) {
    sharedState.QQ.chars[props.name].name = setting.value.name;
  }

  // 输入框颜色为空则为透明
  let inputColor = setting.value.inputColor;
  if (!inputColor || inputColor == '留空' || inputColor == '透明') {
    inputColor = 'transparent';
  }
  sharedState.QQ.chars[props.name].inputColor = inputColor;

  sharedState.QQ.saveChars();
}

async function closeSettingGroup(save) {
  setting.value.enable = false;

  if (!save) {
    loadGroupSetting();
    return;
  }

  if (setting.value.background) {
    sharedState.QQ.chars[props.name].background = setting.value.background;
  }
  if (groupSetting.value.name) {
    sharedState.QQ.chars[props.name].name = groupSetting.value.name;
  }
  await sharedState.QQ.saveChars();

  // 保存内容到世界书
  const entryName = groupSetting.value.entryName;
  const yaml = {
    [entryName]: {
      群初始名称: groupSetting.value.name,
      群成员: groupSetting.value.members,
      群作用: groupSetting.value.content,
    },
  };
  const entryContent = YAML.stringify(yaml);
  console.log(entryContent);
  const entry = sharedState.ST.getEntry([entryName], true);
  if (!entry) {
    await createWorldbookEntries(sharedState.ST.worldName, [
      {
        name: entryName,
        enabled: true,
        position: { type: 'at_depth', role: 'system', depth: 4, order: 5421 },
        strategy: { type: 'constant' },
        content: entryContent,
      },
    ]);
  } else if (entry) {
    await setLorebookEntries(sharedState.ST.worldName, [{ uid: entry.uid, content: entryContent }]);
  }
}

function removeChar() {
  alert('删除还没做,过几天再做');
  return;
  if (!confirm('确定要删除吗?\n聊天记录内的有关内容也会一起删除')) {
    return;
  }
  const isGroup = props.value.chartype == 'Group';
  console.log(`删除角色:${props.name}`);

  // 先删除楼层的聊天记录

  // 再删除世界书里的内容
  const entryName = `群聊：${props.name}`;
}

function randomColor() {
  const { bgColor, textColor } = sharedState.generateBubbleColor();
  setting.value.bubble = bgColor;
  setting.value.text = textColor;
}

function function_click(type) {
  if (containerShow.value.showtype == type) {
    containerShow.value.show = false;
    containerShow.value.showtype = '';
    isIncrease.value = false;
  } else {
    containerShow.value.show = true;
    containerShow.value.showtype = type;
    isIncrease.value = true;
  }
}

function sendSpecial(type) {
  if (sharedState.generate || !inputShow.value) {
    return;
  }
  const name = props.name;
  const send = false;
  console.log(type, special.value.text[type]);
  if (!special.value.text[type]) {
    return;
  }

  const specialValue = special.value.text[type];
  let sendType = '';
  if (type == 'voice') {
    sendType = 'yy';
  } else if (type == 'transfer') {
    sendType = 'zz';
  } else {
    sendType = type;
  }
  let sendMsg;
  if (type != 'transfer') {
    sendMsg = `[${sendType}-${specialValue}]`;
  } else {
    sendMsg = `[${sendType}-${specialValue}元]`;
  }
  console.log(`发送出去的文本:${sendMsg}`);

  if (name in sharedState.QQ.chathistory == false) {
    sharedState.QQ.chathistory[name] = {
      chartype: sharedState.QQ.chars[name].chartype == 'Group' ? 'Group' : 'private',
      msgs: [],
    };
  }

  if (specialValue) {
    const obj = {
      msgtype: type,
      content: specialValue,
      sender: 'user',
      time: '',
    };
    if (type == 'transfer') {
      obj['count'] = specialValue + '元';
    }
    sharedState.QQ.addMsg(name, obj);
  }
  const chartype = sharedState.QQ.chars[props.name]?.chartype;
  if (sharedState.phone.sendModel == '尾附') {
    let message = '';
    if (chartype == 'Group') {
      message += `\n在群聊${props.name}中发送消息:${sendMsg}`;
    } else {
      message += `\n给${props.name}发送消息:${sendMsg}`;
    }
    const old_content = $('#send_textarea').val().trim();
    const new_content = old_content + message;
    $('#send_textarea')
      .val(new_content.trim() || '')[0]
      .dispatchEvent(new Event('input', { bubbles: true }));
    special.value.text[type] = '';
    return;
  }
  if (send) {
    let message = sharedState.QQ.cacheMsg.join('\n').trim();
    if (specialValue) {
      if (chartype == 'Group') {
        message += `\n在群聊${props.name}中发送消息:${sendMsg}`;
      } else {
        message += `\n给${props.name}发送消息:${sendMsg}`;
      }
    }
    sharedState.QQ.cacheMsg = [];
    triggerSlash(`/send ${message.trim()}|/trigger`);
  } else {
    let message = '';
    if (chartype == 'Group') {
      message = `\n在群聊${props.name}中发送消息:${sendMsg}`;
    } else {
      message = `\n给${props.name}发送消息:${sendMsg}`;
    }
    sharedState.QQ.cacheMsg.push(message);
  }
  special.value.text[type] = '';
  // 不确定需不需要反正归零了就对了
  sharedState.QQ.chathistory[name].unread = 0;

  special.value.show = false;
}

function sendEmoji(url, name) {
  if (sharedState.generate || !inputShow.value) {
    return;
  }

  if (props.name in sharedState.QQ.chathistory == false) {
    console.log(`重置了聊天:${name}`);
    console.log(JSON.stringify(sharedState.QQ.chathistory));
    sharedState.QQ.chathistory[props.name] = {
      chartype: sharedState.QQ.chars[props.name].chartype == 'Group' ? 'Group' : 'private',
      msgs: [],
    };
  }

  sharedState.QQ.addMsg(props.name, {
    msgtype: 'emoji',
    emoji: url,
    content: name,
    sender: 'user',
    time: '',
  });

  const chartype = sharedState.QQ.chars[props.name]?.chartype;
  let sendMsg = `[bqb-${name}]`;
  let message = '';

  if (sharedState.phone.sendModel == '尾附') {
    if (chartype == 'Group') {
      message += `\n在群聊${props.name}中发送消息:${sendMsg}`;
    } else {
      message += `\n给${props.name}发送消息:${sendMsg}`;
    }
    const old_content = $('#send_textarea').val().trim();
    const new_content = old_content + message;
    $('#send_textarea')
      .val(new_content.trim() || '')[0]
      .dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  if (chartype == 'Group') {
    message = `\n在群聊${props.name}中发送消息:${sendMsg}`;
  } else {
    message = `\n给${props.name}发送消息:${sendMsg}`;
  }
  sharedState.QQ.cacheMsg.push(message);
}
</script>

<!-- 弹出框动画 -->
<style scoped>
/* 遮罩层 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
/* 弹框动画 */
.popup-enter-active,
.popup-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.popup-enter-from,
.popup-leave-to {
  opacity: 0;
  transform: translate(-50%, -46%) scale(0.96); /* 轻缩小+上移 */
}
.popup-enter-to,
.popup-leave-from {
  opacity: 1;
  transform: translate(-50%, -50%) scale(1);
}
</style>

<style>
.edge-catcher {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 30px; /* 可调 */
  touch-action: none; /* 全放开，保证横向可捕获 */
  z-index: 5; /* 确保在内容之上接收事件 */
}

/* 外层：占位 + 裁切，用 max-height 过渡实现“推开” */
.drawer-wrap {
  overflow: hidden;
  max-height: 0; /* 关闭时不占空间 */
  transition: max-height 0.24s ease;
}
.drawer-wrap.open {
  max-height: 250px; /* 打开时占 250px 空间（你的固定高度） */
}

/* 内层：只做 transform/opacity，避免动布局属性 */
.drawer-enter-active,
.drawer-leave-active {
  transition:
    transform 0.24s ease,
    opacity 0.24s ease;
  will-change: transform, opacity;
}
.drawer-enter-from,
.drawer-leave-to {
  transform: translateY(100%); /* 从自身高度以下滑入/滑出 */
  opacity: 0;
}
.drawer-enter-to,
.drawer-leave-from {
  transform: translateY(0);
  opacity: 1;
}
</style>
