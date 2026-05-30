(function () {
  var root = document.getElementById('revvoCreateMissionRoot');
  if (!root) return;

  var nameInput = root.querySelector('#revvoMissionName');
  var descInput = root.querySelector('#revvoMissionDesc');
  var nameCount = root.querySelector('#revvoNameCount');
  var descCount = root.querySelector('#revvoDescCount');
  var previewTitle = root.querySelector('#revvoPreviewTitle');
  var previewRvc = root.querySelector('#revvoPreviewRvc');
  var rewardQty = root.querySelector('#revvoRewardQty');
  var titles = {
    like: 'Curta este post no Instagram',
    follow: 'Siga o perfil oficial no Instagram',
    comment: 'Comente na publicação no Instagram',
    watch: 'Assista ao vídeo no Instagram',
    share: 'Compartilhe o story da marca'
  };

  function updateCounts() {
    if (nameInput && nameCount) nameCount.textContent = nameInput.value.length + '/60';
    if (descInput && descCount) descCount.textContent = descInput.value.length + '/200';
  }

  function updatePreview() {
    var activeType = root.querySelector('.revvo-create__typeBtn--active');
    var type = activeType ? activeType.getAttribute('data-type') : 'like';
    if (previewTitle) previewTitle.textContent = titles[type] || titles.like;
    if (previewRvc && rewardQty) previewRvc.textContent = (rewardQty.value || '100') + ' RVC';
  }

  root.querySelectorAll('.revvo-create__typeBtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      root.querySelectorAll('.revvo-create__typeBtn').forEach(function (b) {
        b.classList.remove('revvo-create__typeBtn--active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('revvo-create__typeBtn--active');
      btn.setAttribute('aria-checked', 'true');
      updatePreview();
    });
  });

  root.querySelectorAll('.revvo-create__rewardBtn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      root.querySelectorAll('.revvo-create__rewardBtn').forEach(function (b) {
        b.classList.remove('revvo-create__rewardBtn--active');
        b.setAttribute('aria-checked', 'false');
      });
      btn.classList.add('revvo-create__rewardBtn--active');
      btn.setAttribute('aria-checked', 'true');
    });
  });

  if (nameInput) nameInput.addEventListener('input', updateCounts);
  if (descInput) descInput.addEventListener('input', updateCounts);
  if (rewardQty) rewardQty.addEventListener('input', updatePreview);
  updateCounts();
  updatePreview();
})();
