// Deliberately read-only: no analytics, writes, subscriptions or guest-page code.
import { auth, db } from './firebase-init.js';
import { isAdminUser } from './config.js';
import { collection, doc, getDoc, getDocs, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const dialog = document.getElementById('album-inspector');
const content = document.getElementById('inspector-content');
let generation = 0;
export function closeInspector() {
  generation++;
  dialog.close();
  content.replaceChildren();
}
document.getElementById('inspector-close').addEventListener('click', closeInspector);
dialog.addEventListener('close', () => { generation++; content.replaceChildren(); });

function line(parent, tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  parent.append(element);
  return element;
}
function mediaUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}
export async function openInspector(album) {
  const preview = location.hash === '#preview';
  if (!preview && !isAdminUser(auth.currentUser)) return;
  const request = ++generation;
  content.textContent = 'Loading album…';
  document.getElementById('inspector-title').textContent = album.name || 'Album inspector';
  if (!dialog.open) dialog.showModal();
  try {
    let photos = [], messages = [];
    if (!preview) {
      const [event, photoDocs, messageDocs] = await Promise.all([
        getDoc(doc(db, 'events', album.code)),
        getDocs(query(collection(db, 'events', album.code, 'photos'), orderBy('createdAt', 'desc'), limit(100))),
        getDocs(query(collection(db, 'events', album.code, 'messages'), orderBy('createdAt', 'desc'), limit(100)))
      ]);
      if (!event.exists()) throw new Error('Album no longer exists.');
      album = { ...event.data(), code: album.code };
      photos = photoDocs.docs.map(d => d.data());
      messages = messageDocs.docs.map(d => d.data());
    }
    if (request !== generation || (!preview && !isAdminUser(auth.currentUser))) return;
    content.replaceChildren();
    document.getElementById('inspector-title').textContent = album.name || 'Unnamed album';
    line(content, 'p', `${album.code} · ${album.pro ? 'Pro' : album.paid ? 'Party' : 'Free'} · ${album.photoCount || 0} photos · ${album.viewCount || 0} recorded views`);
    line(content, 'p', `Host: ${album.hostName || 'Not provided'} · ${album.hostEmail || 'No email recorded'}`);
    line(content, 'h3', 'Photos and videos');
    line(content, 'p', preview ? 'Sample preview. No customer data is loaded.' : `Newest ${photos.length} items shown (maximum 100).`);
    const grid = document.createElement('div'); grid.className = 'inspector-grid'; content.append(grid);
    for (const photo of photos) {
      const url = mediaUrl(photo.url);
      if (!url) continue;
      const figure = document.createElement('figure');
      const video = photo.type === 'video' || String(photo.type || '').startsWith('video/');
      const media = document.createElement(video ? 'video' : 'img');
      media.src = url;
      if (video) { media.controls = true; media.preload = 'none'; }
      else { media.loading = 'lazy'; media.alt = 'Album photo'; }
      figure.append(media);
      line(figure, 'figcaption', photo.uploaderName || 'Guest');
      grid.append(figure);
    }
    line(content, 'h3', 'Guestbook');
    line(content, 'p', `Newest ${messages.length} messages shown (maximum 100).`);
    for (const message of messages) {
      const row = document.createElement('blockquote');
      line(row, 'strong', message.authorName || 'Guest');
      line(row, 'p', message.text || '');
      content.append(row);
    }
  } catch (error) {
    if (request === generation) content.textContent = 'Could not load this album. Close and try again.';
  }
}
