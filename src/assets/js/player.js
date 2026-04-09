// Lightweight audio player controller. Each .player element on the page is
// initialised independently so the home and episode pages can both have one.

(function () {
  "use strict";

  const RATES = [1, 1.25, 1.5, 1.75, 2];

  function pad(n) {
    return String(Math.floor(n)).padStart(2, "0");
  }

  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return "00:00";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function init(root) {
    const audio = root.querySelector("[data-player-audio]");
    if (!audio) return;

    const toggleBtn = root.querySelector("[data-player-toggle]");
    const playIcon = root.querySelector(".player__icon--play");
    const pauseIcon = root.querySelector(".player__icon--pause");
    const skipBtns = root.querySelectorAll("[data-player-skip]");
    const currentEl = root.querySelector("[data-player-current]");
    const totalEl = root.querySelector("[data-player-total]");
    const scrub = root.querySelector("[data-player-scrub]");
    const rateBtn = root.querySelector("[data-player-rate]");

    let scrubbing = false;
    let rateIndex = 0;

    function setPlaying(playing) {
      if (playing) {
        playIcon.hidden = true;
        pauseIcon.hidden = false;
        toggleBtn.setAttribute("aria-label", "Pause episode");
      } else {
        playIcon.hidden = false;
        pauseIcon.hidden = true;
        toggleBtn.setAttribute("aria-label", "Play episode");
      }
    }

    toggleBtn.addEventListener("click", () => {
      if (audio.paused) audio.play();
      else audio.pause();
    });

    audio.addEventListener("play", () => setPlaying(true));
    audio.addEventListener("pause", () => setPlaying(false));
    audio.addEventListener("ended", () => setPlaying(false));

    skipBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        const delta = Number(btn.getAttribute("data-player-skip")) || 0;
        audio.currentTime = Math.max(
          0,
          Math.min(audio.duration || Infinity, audio.currentTime + delta),
        );
      });
    });

    audio.addEventListener("loadedmetadata", () => {
      if (totalEl) totalEl.textContent = formatTime(audio.duration);
    });

    // Pre-fill from data-duration so the UI shows a real total before metadata loads
    const presetDuration = Number(audio.getAttribute("data-duration"));
    if (totalEl && presetDuration > 0) {
      totalEl.textContent = formatTime(presetDuration);
    }

    audio.addEventListener("timeupdate", () => {
      if (currentEl) currentEl.textContent = formatTime(audio.currentTime);
      if (scrub && !scrubbing && audio.duration) {
        scrub.value = String(Math.round((audio.currentTime / audio.duration) * 1000));
      }
    });

    if (scrub) {
      scrub.addEventListener("input", () => {
        scrubbing = true;
      });
      scrub.addEventListener("change", () => {
        if (audio.duration) {
          audio.currentTime = (Number(scrub.value) / 1000) * audio.duration;
        }
        scrubbing = false;
      });
    }

    if (rateBtn) {
      rateBtn.addEventListener("click", () => {
        rateIndex = (rateIndex + 1) % RATES.length;
        const rate = RATES[rateIndex];
        audio.playbackRate = rate;
        rateBtn.textContent = `${rate}x`;
      });
    }

    // Keyboard: space toggles, left/right skip 15s, when player is focused
    root.addEventListener("keydown", (e) => {
      if (e.target.tagName === "INPUT") return;
      if (e.code === "Space") {
        e.preventDefault();
        toggleBtn.click();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        audio.currentTime = Math.max(0, audio.currentTime - 15);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 15);
      }
    });
    root.tabIndex = 0;
  }

  document.querySelectorAll("[data-player]").forEach(init);
})();
