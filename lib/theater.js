const CLASS_NAME = 'super-zoom-theater';

export function enableTheater() {
  document.documentElement.classList.add(CLASS_NAME);
}

export function disableTheater() {
  document.documentElement.classList.remove(CLASS_NAME);
}

export function isTheaterEnabled() {
  return document.documentElement.classList.contains(CLASS_NAME);
}

export function toggleTheater() {
  if (isTheaterEnabled()) {
    disableTheater();
    return false;
  }
  enableTheater();
  return true;
}
