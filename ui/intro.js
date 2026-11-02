// Three-card intro carousel shown before the clock starts.
import { showLesson } from './lesson.js';

export const INTRO_CARDS = [
  { title: 'Time runs', body: 'Each tick is one trading day of the real record. Press Space to pause, and speed up when you are ready.' },
  { title: 'Your shares unlock', body: 'Your $100 million is locked. Shares become free on the dates in the prospectus, and the seals on your certificate break one by one.' },
  { title: 'Your family spends', body: 'Your family spends $2 million a year, taken on the first trading day of each month. Three rivals play the same card: The Holder, The Seller and The Playbook.' },
];

export function showIntro() {
  return showLesson(INTRO_CARDS, { kicker: 'Before the clock starts', skipLabel: 'Skip', doneLabel: 'Start the clock', label: 'Introduction' });
}
