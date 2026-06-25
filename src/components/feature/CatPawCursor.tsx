import { useEffect } from "react";

const PAW_CURSOR =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cfilter id='s' x='-30%25' y='-30%25' width='160%25' height='160%25'%3E%3CfeDropShadow dx='0' dy='2' stdDeviation='1.2' flood-color='%23000000' flood-opacity='.45'/%3E%3C/filter%3E%3Cg filter='url(%23s)' transform='rotate(-18 16 16)'%3E%3Cellipse cx='15.8' cy='20.3' rx='6.2' ry='5.3' fill='%23ffd9df' stroke='%23ef4444' stroke-opacity='.58' stroke-width='1.15'/%3E%3Cellipse cx='7.7' cy='13.8' rx='3.2' ry='3.7' fill='%23fff3f5' stroke='%23ef4444' stroke-opacity='.5' stroke-width='1'/%3E%3Cellipse cx='13' cy='9.1' rx='3.1' ry='3.9' fill='%23fff3f5' stroke='%23ef4444' stroke-opacity='.5' stroke-width='1'/%3E%3Cellipse cx='19.1' cy='9.1' rx='3.1' ry='3.9' fill='%23fff3f5' stroke='%23ef4444' stroke-opacity='.5' stroke-width='1'/%3E%3Cellipse cx='24.4' cy='13.8' rx='3.2' ry='3.7' fill='%23fff3f5' stroke='%23ef4444' stroke-opacity='.5' stroke-width='1'/%3E%3C/g%3E%3C/svg%3E\") 9 9, auto";

const PAW_POINTER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cfilter id='s' x='-30%25' y='-30%25' width='160%25' height='160%25'%3E%3CfeDropShadow dx='0' dy='2' stdDeviation='1.2' flood-color='%23000000' flood-opacity='.45'/%3E%3C/filter%3E%3Cg filter='url(%23s)' transform='rotate(-12 16 16)'%3E%3Cellipse cx='15.8' cy='20.3' rx='6.6' ry='5.6' fill='%23ffb8c2' stroke='%23ef4444' stroke-opacity='.72' stroke-width='1.25'/%3E%3Cellipse cx='7.7' cy='13.8' rx='3.3' ry='3.8' fill='%23fff3f5' stroke='%23ef4444' stroke-opacity='.62' stroke-width='1.05'/%3E%3Cellipse cx='13' cy='9.1' rx='3.2' ry='4' fill='%23fff3f5' stroke='%23ef4444' stroke-opacity='.62' stroke-width='1.05'/%3E%3Cellipse cx='19.1' cy='9.1' rx='3.2' ry='4' fill='%23fff3f5' stroke='%23ef4444' stroke-opacity='.62' stroke-width='1.05'/%3E%3Cellipse cx='24.4' cy='13.8' rx='3.3' ry='3.8' fill='%23fff3f5' stroke='%23ef4444' stroke-opacity='.62' stroke-width='1.05'/%3E%3C/g%3E%3C/svg%3E\") 9 9, pointer";

export default function CatPawCursor() {
  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine) and (hover: hover)");
    if (!finePointer.matches) return;

    const style = document.createElement("style");
    style.dataset.kpCatPawCursor = "true";
    style.textContent = `
      @media (pointer: fine) and (hover: hover) {
        html,
        body,
        body * {
          cursor: ${PAW_CURSOR} !important;
        }

        a,
        button,
        [role="button"],
        summary,
        label,
        select,
        input[type="button"],
        input[type="submit"],
        input[type="reset"],
        .cursor-pointer,
        video,
        iframe {
          cursor: ${PAW_POINTER} !important;
        }

        input,
        textarea,
        [contenteditable="true"] {
          cursor: text !important;
        }

        :fullscreen,
        :fullscreen *,
        :-webkit-full-screen,
        :-webkit-full-screen *,
        .kp-has-native-fullscreen,
        .kp-has-native-fullscreen * {
          cursor: ${PAW_CURSOR} !important;
        }

        :fullscreen a,
        :fullscreen button,
        :fullscreen [role="button"],
        :fullscreen video,
        :fullscreen iframe,
        :-webkit-full-screen a,
        :-webkit-full-screen button,
        :-webkit-full-screen [role="button"],
        :-webkit-full-screen video,
        :-webkit-full-screen iframe,
        .kp-has-native-fullscreen a,
        .kp-has-native-fullscreen button,
        .kp-has-native-fullscreen [role="button"],
        .kp-has-native-fullscreen video,
        .kp-has-native-fullscreen iframe {
          cursor: ${PAW_POINTER} !important;
        }
      }
    `;
    document.head.appendChild(style);

    const syncFullscreenCursor = () => {
      const webkitFullscreenElement = (document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement;
      document.documentElement.classList.toggle(
        "kp-has-native-fullscreen",
        Boolean(document.fullscreenElement || webkitFullscreenElement)
      );
    };

    document.addEventListener("fullscreenchange", syncFullscreenCursor);
    document.addEventListener("webkitfullscreenchange", syncFullscreenCursor);
    syncFullscreenCursor();

    return () => {
      document.removeEventListener("fullscreenchange", syncFullscreenCursor);
      document.removeEventListener("webkitfullscreenchange", syncFullscreenCursor);
      document.documentElement.classList.remove("kp-has-native-fullscreen");
      style.remove();
    };
  }, []);

  return null;
}
