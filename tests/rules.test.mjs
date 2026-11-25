import fs from 'node:fs'
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing'
import {
  arrayRemove,
  arrayUnion,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'

const RULES = process.argv[2]
const testEnv = await initializeTestEnvironment({
  projectId: 'demo-organyzer',
  firestore: { rules: fs.readFileSync(RULES, 'utf8') },
})

const big = (n) => 'x'.repeat(n)
const as = (uid) => testEnv.authenticatedContext(uid).firestore()
const item = (db, id) => doc(db, 'groups', 'g1', 'boards', 'b1', 'items', id)
const board = (db) => doc(db, 'groups', 'g1', 'boards', 'b1')
const group = (db) => doc(db, 'groups', 'g1')

async function reset() {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(group(db), {
      name: 'G',
      ownerId: 'alice',
      memberIds: ['alice', 'bob'],
      roles: { alice: 'admin', bob: 'guest' },
      profiles: { alice: { name: 'A', photoURL: '' }, bob: { name: 'B', photoURL: '' } },
      createdAt: new Date(),
    })
    await setDoc(board(db), { name: 'Board', createdAt: new Date() })
    await setDoc(item(db, 't1'), { type: 'text', text: 'hello', authorId: 'alice', createdAt: new Date() })
    await setDoc(item(db, 'img1'), { type: 'image', src: big(1000), authorId: 'bob', createdAt: new Date() })
    await setDoc(doc(db, 'usage', 'bob'), { imageBytes: 1000, lastImageId: 'img1' })
  })
}

let failed = 0
let total = 0
async function test(name, fn) {
  total++
  await reset()
  try {
    await fn()
    console.log('  ok   ', name)
  } catch (e) {
    failed++
    console.log('  FAIL ', name, '->', String(e.message || e).split('\n')[0].slice(0, 160))
  }
}

async function addImage(db, uid, id, chars, usedBefore, extra = {}) {
  const batch = writeBatch(db)
  batch.set(doc(db, 'usage', uid), { imageBytes: usedBefore + chars, lastImageId: id })
  batch.set(item(db, id), {
    type: 'image',
    src: big(chars),
    authorId: uid,
    createdAt: serverTimestamp(),
    ...extra,
  })
  return batch.commit()
}

console.log('\nGroups, roles and members')
await test('member reads group; outsider can get it by id (invite code)', async () => {
  await assertSucceeds(getDoc(group(as('bob'))))
  await assertSucceeds(getDoc(group(as('carol'))))
})
await test('outsider cannot read items or boards', async () => {
  await assertFails(getDoc(item(as('carol'), 't1')))
  await assertFails(getDoc(board(as('carol'))))
})
await test('create group as self (admin, own profile)', async () => {
  await assertSucceeds(
    setDoc(doc(as('dave'), 'groups', 'g9'), {
      name: 'Mine',
      ownerId: 'dave',
      memberIds: ['dave'],
      roles: { dave: 'admin' },
      profiles: { dave: { name: 'D', photoURL: '' } },
      createdAt: serverTimestamp(),
    }),
  )
})
await test('create group claiming another owner is denied', async () => {
  await assertFails(
    setDoc(doc(as('dave'), 'groups', 'g9'), {
      name: 'x', ownerId: 'alice', memberIds: ['dave'], roles: { dave: 'admin' },
      profiles: { dave: { name: 'D', photoURL: '' } }, createdAt: serverTimestamp(),
    }),
  )
})
await test('outsider joins as guest', async () => {
  await assertSucceeds(
    updateDoc(group(as('carol')), {
      memberIds: arrayUnion('carol'),
      'roles.carol': 'guest',
      'profiles.carol': { name: 'C', photoURL: '' },
    }),
  )
})
await test('outsider cannot join as admin', async () => {
  await assertFails(
    updateDoc(group(as('carol')), {
      memberIds: arrayUnion('carol'),
      'roles.carol': 'admin',
      'profiles.carol': { name: 'C', photoURL: '' },
    }),
  )
})
await test('joining cannot also change another member role', async () => {
  await assertFails(
    updateDoc(group(as('carol')), {
      memberIds: arrayUnion('carol'),
      'roles.carol': 'guest',
      'roles.bob': 'admin',
      'profiles.carol': { name: 'C', photoURL: '' },
    }),
  )
})
await test('member updates own profile; not someone else', async () => {
  await assertSucceeds(updateDoc(group(as('bob')), { 'profiles.bob': { name: 'Bob', photoURL: '' } }))
  await assertFails(updateDoc(group(as('bob')), { 'profiles.alice': { name: 'Hacked', photoURL: '' } }))
})
await test('admin changes a role; guest cannot', async () => {
  await assertFails(updateDoc(group(as('bob')), { 'roles.bob': 'admin' })) // guest cannot self-promote
  await assertSucceeds(updateDoc(group(as('alice')), { 'roles.bob': 'admin' }))
})
await test('admin cannot change the creator role', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(group(ctx.firestore()), { 'roles.bob': 'admin' })
  })
  await assertFails(updateDoc(group(as('bob')), { 'roles.alice': 'guest' }))
})
await test('admin removes a member; guest cannot remove others', async () => {
  await assertSucceeds(
    updateDoc(group(as('alice')), {
      memberIds: arrayRemove('bob'),
      'roles.bob': deleteField(),
      'profiles.bob': deleteField(),
    }),
  )
})
await test('guest cannot remove another guest', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(group(ctx.firestore()), {
      memberIds: arrayUnion('dave'),
      'roles.dave': 'guest',
      'profiles.dave': { name: 'D', photoURL: '' },
    })
  })
  await assertFails(
    updateDoc(group(as('bob')), {
      memberIds: arrayRemove('dave'),
      'roles.dave': deleteField(),
      'profiles.dave': deleteField(),
    }),
  )
  await assertSucceeds(
    updateDoc(group(as('alice')), {
      memberIds: arrayRemove('dave'),
      'roles.dave': deleteField(),
      'profiles.dave': deleteField(),
    }),
  )
})
await test('guest cannot remove the creator', async () => {
  await assertFails(
    updateDoc(group(as('bob')), {
      memberIds: arrayRemove('alice'),
      'roles.alice': deleteField(),
      'profiles.alice': deleteField(),
    }),
  )
})
await test('member leaves by themself', async () => {
  await assertSucceeds(
    updateDoc(group(as('bob')), {
      memberIds: arrayRemove('bob'),
      'roles.bob': deleteField(),
      'profiles.bob': deleteField(),
    }),
  )
})
await test('creator cannot leave', async () => {
  await assertFails(
    updateDoc(group(as('alice')), {
      memberIds: arrayRemove('alice'),
      'roles.alice': deleteField(),
      'profiles.alice': deleteField(),
    }),
  )
})
await test('removal cannot tamper with another profile at the same time', async () => {
  await assertFails(
    updateDoc(group(as('alice')), {
      memberIds: arrayRemove('bob'),
      'roles.bob': deleteField(),
      'profiles.bob': deleteField(),
      'profiles.alice': { name: 'Changed', photoURL: '' },
    }),
  )
})
await test('admin renames group; guest cannot', async () => {
  await assertSucceeds(updateDoc(group(as('alice')), { name: 'New name' }))
  await assertFails(updateDoc(group(as('bob')), { name: 'Nope' }))
})
await test('nobody can delete a group', async () => {
  await assertFails(deleteDoc(group(as('alice'))))
})

console.log('\nBoards')
await test('admin creates board; guest cannot', async () => {
  await assertSucceeds(setDoc(doc(as('alice'), 'groups', 'g1', 'boards', 'b2'), { name: 'B2', createdAt: serverTimestamp() }))
  await assertFails(setDoc(doc(as('bob'), 'groups', 'g1', 'boards', 'b3'), { name: 'B3', createdAt: serverTimestamp() }))
})
await test('admin creates a template board with items in one batch', async () => {
  const db = as('alice')
  const b = writeBatch(db)
  b.set(doc(db, 'groups', 'g1', 'boards', 'b4'), { name: 'Tpl', createdAt: serverTimestamp() })
  b.set(doc(db, 'groups', 'g1', 'boards', 'b4', 'items', 'i1'), { type: 'checklist', title: 'To do', tasks: [], color: 'blue', authorId: 'alice', order: 1, createdAt: serverTimestamp() })
  b.set(doc(db, 'groups', 'g1', 'boards', 'b4', 'items', 'i2'), { type: 'table', cols: 2, header: true, span: 2, cells: ['a', 'b', 'c', ''], authorId: 'alice', order: 2, createdAt: serverTimestamp() })
  await assertSucceeds(b.commit())
})
await test('any member stamps the board last edit; cannot rename it', async () => {
  await assertSucceeds(updateDoc(board(as('bob')), { updatedAt: serverTimestamp(), updatedBy: 'bob' }))
  await assertFails(updateDoc(board(as('bob')), { name: 'Hacked', updatedAt: serverTimestamp(), updatedBy: 'bob' }))
})
await test('guest cannot forge updatedBy', async () => {
  await assertFails(updateDoc(board(as('bob')), { updatedAt: serverTimestamp(), updatedBy: 'alice' }))
})
await test('admin renames board; admin deletes board', async () => {
  await assertSucceeds(updateDoc(board(as('alice')), { name: 'Renamed', updatedAt: serverTimestamp(), updatedBy: 'alice' }))
  await assertSucceeds(deleteDoc(board(as('alice'))))
})
await test('guest cannot delete a board', async () => {
  await assertFails(deleteDoc(board(as('bob'))))
})

console.log('\nPresence')
await test('own presence ok, other member presence denied, outsider denied', async () => {
  const p = (db, id) => doc(db, 'groups', 'g1', 'presence', id)
  await assertSucceeds(setDoc(p(as('bob'), 'bob'), { lastSeen: serverTimestamp() }))
  await assertFails(setDoc(p(as('bob'), 'alice'), { lastSeen: serverTimestamp() }))
  await assertFails(setDoc(p(as('carol'), 'carol'), { lastSeen: serverTimestamp() }))
  await assertFails(setDoc(p(as('bob'), 'bob'), { lastSeen: serverTimestamp(), extra: 1 }))
})

console.log('\nItems: content and limits')
await test('member adds text, link, checklist, table items', async () => {
  const db = as('bob')
  await assertSucceeds(setDoc(item(db, 'n1'), { type: 'text', text: 'hi', authorId: 'bob', createdAt: serverTimestamp() }))
  await assertSucceeds(setDoc(item(db, 'n2'), { type: 'link', url: 'https://example.com', title: 'x', authorId: 'bob', createdAt: serverTimestamp() }))
  await assertSucceeds(setDoc(item(db, 'n3'), { type: 'checklist', title: 'l', tasks: [{ id: '1', text: 'a', done: false }], authorId: 'bob', createdAt: serverTimestamp() }))
  await assertSucceeds(setDoc(item(db, 'n4'), { type: 'table', cols: 2, cells: ['a', 'b', 'c', 'd'], authorId: 'bob', createdAt: serverTimestamp() }))
})
await test('style and order updates are allowed', async () => {
  await assertSucceeds(updateDoc(item(as('bob'), 't1'), { color: 'green', span: 2, fontSize: 'l', order: 5 }))
  await assertSucceeds(updateDoc(item(as('bob'), 't1'), { text: 'edited' }))
})
await test('non-image item with a src payload is denied', async () => {
  await assertFails(setDoc(item(as('bob'), 'n5'), { type: 'text', text: 'x', src: big(5000), authorId: 'bob', createdAt: serverTimestamp() }))
})
await test('unknown extra field is denied (create and update)', async () => {
  await assertFails(setDoc(item(as('bob'), 'n6'), { type: 'text', text: 'x', blob: big(5000), authorId: 'bob', createdAt: serverTimestamp() }))
  await assertFails(updateDoc(item(as('bob'), 't1'), { blob: 'x' }))
})
await test('text over 20000 chars denied, exactly 20000 ok', async () => {
  await assertFails(setDoc(item(as('bob'), 'n7'), { type: 'text', text: big(20001), authorId: 'bob', createdAt: serverTimestamp() }))
  await assertSucceeds(setDoc(item(as('bob'), 'n8'), { type: 'text', text: big(20000), authorId: 'bob', createdAt: serverTimestamp() }))
  await assertFails(updateDoc(item(as('bob'), 't1'), { text: big(20001) }))
})
await test('title, url, task count and cell count limits', async () => {
  const db = as('bob')
  await assertFails(setDoc(item(db, 'l1'), { type: 'link', url: 'https://x.com/' + big(2100), authorId: 'bob', createdAt: serverTimestamp() }))
  await assertFails(setDoc(item(db, 'l2'), { type: 'checklist', title: big(101), tasks: [], authorId: 'bob', createdAt: serverTimestamp() }))
  const tasks = (n) => Array.from({ length: n }, (_, i) => ({ id: String(i), text: 'a', done: false }))
  await assertSucceeds(setDoc(item(db, 'l3'), { type: 'checklist', tasks: tasks(100), authorId: 'bob', createdAt: serverTimestamp() }))
  await assertFails(setDoc(item(db, 'l4'), { type: 'checklist', tasks: tasks(101), authorId: 'bob', createdAt: serverTimestamp() }))
  await assertSucceeds(setDoc(item(db, 'l5'), { type: 'table', cols: 10, cells: Array(200).fill('a'), authorId: 'bob', createdAt: serverTimestamp() }))
  await assertFails(setDoc(item(db, 'l6'), { type: 'table', cols: 10, cells: Array(201).fill('a'), authorId: 'bob', createdAt: serverTimestamp() }))
  await assertFails(setDoc(item(db, 'l7'), { type: 'table', cols: 11, cells: ['a'], authorId: 'bob', createdAt: serverTimestamp() }))
})
await test('outsider cannot write items', async () => {
  await assertFails(setDoc(item(as('carol'), 'z1'), { type: 'text', text: 'x', authorId: 'carol', createdAt: serverTimestamp() }))
})
await test('members can delete items', async () => {
  await assertSucceeds(deleteDoc(item(as('bob'), 't1')))
})

console.log('\nImages and quota')
await test('first image creates the counter (alice, no usage doc yet)', async () => {
  await assertSucceeds(addImage(as('alice'), 'alice', 'a1', 5000, 0))
})
await test('image with the counter increase works for bob (existing counter)', async () => {
  await assertSucceeds(addImage(as('bob'), 'bob', 'b2', 5000, 1000))
})
await test('image without touching the counter is denied', async () => {
  await assertFails(setDoc(item(as('bob'), 'x1'), { type: 'image', src: big(5000), authorId: 'bob', createdAt: serverTimestamp() }))
})
await test('counter increase smaller than the image is denied', async () => {
  const db = as('bob')
  const b = writeBatch(db)
  b.set(doc(db, 'usage', 'bob'), { imageBytes: 1000 + 10, lastImageId: 'x2' })
  b.set(item(db, 'x2'), { type: 'image', src: big(5000), authorId: 'bob', createdAt: serverTimestamp() })
  await assertFails(b.commit())
})
await test('one increase cannot pay for two images in one batch', async () => {
  const db = as('bob')
  const b = writeBatch(db)
  b.set(doc(db, 'usage', 'bob'), { imageBytes: 1000 + 5000, lastImageId: 'p1' })
  b.set(item(db, 'p1'), { type: 'image', src: big(5000), authorId: 'bob', createdAt: serverTimestamp() })
  b.set(item(db, 'p2'), { type: 'image', src: big(5000), authorId: 'bob', createdAt: serverTimestamp() })
  await assertFails(b.commit())
})
await test('image over 400000 chars is denied', async () => {
  await assertFails(addImage(as('bob'), 'bob', 'big1', 400001, 1000))
})
await test('image of exactly 400000 chars is allowed', async () => {
  await assertSucceeds(addImage(as('bob'), 'bob', 'big2', 400000, 1000))
})
await test('counter cannot pass 30,000,000', async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'usage', 'bob'), { imageBytes: 29_900_000, lastImageId: 'img1' })
  })
  await assertFails(addImage(as('bob'), 'bob', 'over', 200_000, 29_900_000))
  await assertSucceeds(addImage(as('bob'), 'bob', 'fits', 100_000, 29_900_000))
})
await test('image item with a missing or non-string src is denied', async () => {
  const db = as('bob')
  const b = writeBatch(db)
  b.set(doc(db, 'usage', 'bob'), { imageBytes: 2000, lastImageId: 'm1' })
  b.set(item(db, 'm1'), { type: 'image', authorId: 'bob', createdAt: serverTimestamp() })
  await assertFails(b.commit())
})
await test('image authored as someone else is denied', async () => {
  const db = as('bob')
  const b = writeBatch(db)
  b.set(doc(db, 'usage', 'bob'), { imageBytes: 6000, lastImageId: 'f1' })
  b.set(item(db, 'f1'), { type: 'image', src: big(5000), authorId: 'alice', createdAt: serverTimestamp() })
  await assertFails(b.commit())
})
await test('cannot change src, type or authorId of an existing item', async () => {
  await assertFails(updateDoc(item(as('bob'), 'img1'), { src: big(100) }))
  await assertFails(updateDoc(item(as('bob'), 't1'), { type: 'image' }))
  await assertFails(updateDoc(item(as('bob'), 't1'), { authorId: 'bob' }))
  await assertSucceeds(updateDoc(item(as('bob'), 'img1'), { color: 'pink' }))
})
await test('usage: others cannot read or write my counter; no delete', async () => {
  await assertFails(getDoc(doc(as('alice'), 'usage', 'bob')))
  await assertFails(setDoc(doc(as('alice'), 'usage', 'bob'), { imageBytes: 0 }))
  await assertSucceeds(getDoc(doc(as('bob'), 'usage', 'bob')))
  await assertFails(deleteDoc(doc(as('bob'), 'usage', 'bob')))
})
await test('usage: standalone decrease or reset is denied', async () => {
  await assertFails(setDoc(doc(as('bob'), 'usage', 'bob'), { imageBytes: 0 }))
  await assertFails(setDoc(doc(as('bob'), 'usage', 'bob'), { imageBytes: 500, lastRemoved: { g: 'g1', b: 'b1', i: 'img1' } }))
})

console.log('\nRefund when deleting your own image')
await test('deleting own image with the exact refund works', async () => {
  const db = as('bob')
  const b = writeBatch(db)
  b.delete(item(db, 'img1'))
  b.set(doc(db, 'usage', 'bob'), { imageBytes: 0, lastRemoved: { g: 'g1', b: 'b1', i: 'img1' } })
  await assertSucceeds(b.commit())
})
await test('same refund through runTransaction (what the app does)', async () => {
  const db = as('bob')
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      const usageRef = doc(db, 'usage', 'bob')
      const snap = await tx.get(usageRef)
      tx.delete(item(db, 'img1'))
      tx.set(usageRef, { imageBytes: snap.data().imageBytes - 1000, lastRemoved: { g: 'g1', b: 'b1', i: 'img1' } })
    }),
  )
})
await test('refund bigger than the image is denied', async () => {
  const db = as('bob')
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'usage', 'bob'), { imageBytes: 9000, lastImageId: 'img1' })
  })
  const b = writeBatch(db)
  b.delete(item(db, 'img1'))
  b.set(doc(db, 'usage', 'bob'), { imageBytes: 3000, lastRemoved: { g: 'g1', b: 'b1', i: 'img1' } })
  await assertFails(b.commit())
})
await test('refund without deleting the item is denied', async () => {
  await assertFails(setDoc(doc(as('bob'), 'usage', 'bob'), { imageBytes: 0, lastRemoved: { g: 'g1', b: 'b1', i: 'img1' } }))
})
await test('refund for an image someone else uploaded is denied', async () => {
  const db = as('alice')
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'usage', 'alice'), { imageBytes: 5000 })
  })
  const b = writeBatch(db)
  b.delete(item(db, 'img1')) // bob's image
  b.set(doc(db, 'usage', 'alice'), { imageBytes: 4000, lastRemoved: { g: 'g1', b: 'b1', i: 'img1' } })
  await assertFails(b.commit())
})
await test('refund pointing at a non-image item is denied', async () => {
  const db = as('bob')
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(item(ctx.firestore(), 'tb'), { type: 'text', text: 'x', authorId: 'bob', createdAt: new Date() })
  })
  const b = writeBatch(db)
  b.delete(item(db, 'tb'))
  b.set(doc(db, 'usage', 'bob'), { imageBytes: 900, lastRemoved: { g: 'g1', b: 'b1', i: 'tb' } })
  await assertFails(b.commit())
})
await test('refunding the same image twice is impossible', async () => {
  const db = as('bob')
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      tx.delete(item(db, 'img1'))
      tx.set(doc(db, 'usage', 'bob'), { imageBytes: 0, lastRemoved: { g: 'g1', b: 'b1', i: 'img1' } })
    }),
  )
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'usage', 'bob'), { imageBytes: 5000, lastRemoved: { g: 'g1', b: 'b1', i: 'img1' } })
  })
  await assertFails(setDoc(doc(db, 'usage', 'bob'), { imageBytes: 4000, lastRemoved: { g: 'g1', b: 'b1', i: 'img1' } }))
})
await test('upload, delete and re-upload cycle keeps the counter honest', async () => {
  const db = as('bob')
  await assertSucceeds(addImage(db, 'bob', 'c1', 5000, 1000)) // counter 6000
  await assertSucceeds(
    runTransaction(db, async (tx) => {
      tx.delete(item(db, 'c1'))
      tx.set(doc(db, 'usage', 'bob'), { imageBytes: 1000, lastRemoved: { g: 'g1', b: 'b1', i: 'c1' } })
    }),
  )
  await assertSucceeds(addImage(db, 'bob', 'c2', 5000, 1000)) // counter 6000 again
})

console.log(`\n${total - failed}/${total} passed`)
await testEnv.cleanup()
process.exit(failed ? 1 : 0)
