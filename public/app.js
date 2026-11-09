(function () {
  const canvas = document.getElementById("mapCanvas");
  const ctx = canvas.getContext("2d");

  const params = new URLSearchParams(window.location.search);
  const isRenderMode = params.get("render") === "1";
  if (isRenderMode) {
    document.body.classList.add("render-mode");
  }

  const DURATION = 24.0;

  // Crop bounds of the main satellite map inside public/gaza_map.jpg (1408x768)
  // Excluding the static right sidebar (x > 1216) so the camera zooms pure map geography.
  const MAP_CROP = { x: 18, y: 22, w: 1198, h: 724 };

  // Exact coordinates in original 1408x768 image space
  const GAZA_EAST_BORDER = [
    [886, 39],   // North tip (Erez)
    [970, 120],
    [1053, 200], // North-East corner (East of Beit Hanoun)
    [1008, 242], // South-East of Beit Hanoun
    [952, 258],  // East of Gaza City
    [892, 290],
    [830, 332],
    [765, 378],
    [700, 426],
    [646, 468],
    [628, 498],  // Kissufim bend
    [626, 550],
    [622, 608],  // South-East bend (East of Abasan/Khuzaa)
    [596, 638],
    [510, 668],
    [420, 698],
    [330, 726]   // Southern tip (Salah al-Din Gate)
  ];

  const GAZA_SOUTH_BORDER = [
    [330, 726],
    [305, 688],
    [282, 645],
    [252, 594],
    [212, 576],
    [178, 524]   // South-West coastal tip (Rafah beach)
  ];

  const GAZA_WEST_COAST = [
    [178, 524],
    [255, 458],
    [330, 392],
    [388, 342],
    [455, 285], // Wait: let us use exact verified coastal coordinates from overlay_test3!
  ];

  // Verified coastal coordinates from overlay_test3:
  const VERIFIED_WEST_COAST = [
    [178, 524],  // SW coastal corner (Rafah west)
    [245, 468],
    [315, 410],
    [385, 350],
    [455, 290]
  ];
})();
