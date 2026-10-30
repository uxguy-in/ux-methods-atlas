// The built-in example for the interview coding workbench: six short fictional interviews (P1–P6, made-up people, no
// real participants) about booking GP appointments and ordering repeat prescriptions through a surgery's app,
// partially coded so every step shows something. P1–P4 are coded, P5 half coded and P6 not coded at all.
// Coding is attached by a phrase from the segment, so the transcripts can be edited without renumbering.
import { prepare } from './qual-core.js';

export const EXAMPLE_TEXT = `# P1
I: Can you tell me about the last time you needed to see a GP?
P1: It was back in March. I had a chest infection that would not shift, so I tried to book an appointment. I opened the app at about seven in the morning and there were no appointments showing at all, just a message saying to call the surgery.
I: What did you do then?
P1: I rang at eight like everyone else. I was number twenty-three in the phone queue, and by the time I got through to the receptionist every same-day appointment had gone. Honestly it felt like a lottery. You either win the eight o'clock scramble or you try again tomorrow.
I: How did that make you feel?
P1: Frustrated, mostly. I was ill and I had to take the morning off work just to sit in a phone queue. The app is supposed to save you that, but if the appointments are never in the app then what is the point of it?
I: You mentioned the app. How do you get into it?
P1: That's another thing. I can never remember my password, so I reset it nearly every time. Then it sends a verification code by text, and sometimes the code takes ages to arrive. Once it came after the code had already expired, so I had to start again.
I: Is there anything you do use the app for?
P1: Repeat prescriptions, and that part is actually great. I tick my inhaler, press request, and it goes to the pharmacy. It is quick and easy, much better than dropping a paper slip at the surgery.
I: What happens after you request a prescription?
P1: That's the bit I'm not sure about. It says "request sent" and then nothing. I don't know if the doctor has approved it or whether the pharmacy has it. I usually turn up at the pharmacy and hope the medication is ready to collect.
I: Would anything help with that?
P1: A notification when the prescription is ready to collect would be brilliant. Even a text message. Just something that tells me it went through, so I am not making a wasted trip.

# P2
I: Tell me how you usually book appointments for your family.
P2: I book for my mum as well as for myself. She is eighty-one and she does not use smartphones, so I have proxy access to her account. It took weeks to set up, lots of forms and a visit to the surgery with her identity documents.
I: How does booking for her work now?
P2: I have to log out of my account and log in to hers with a different password and a different verification code. The codes go to my phone, so I end up juggling two accounts and two codes. It is clunky and I make mistakes, like booking her blood test under my own name.
I: What happened when that went wrong?
P2: I had to ring the receptionist to swap it over, which defeats the purpose. Most of the time I just phone the surgery anyway because it is simpler than fighting with the login. The receptionist knows us, so I trust that more.
I: Have you ever been able to book a same-day appointment in the app?
P2: Never. The appointments page only shows routine slots three or four weeks away. For anything urgent you are back to the eight o'clock phone queue. It feels like the app is for people who are not actually ill.
I: What about test results?
P2: My mum had blood test results last month. The app said "results available, please contact the surgery" and nothing else. I was really worried. Did that mean something bad? I could not get through on the phone until the next day, and it turned out the results were normal.
I: How did you feel during that wait?
P2: Anxious, honestly. A message like that with no explanation is awful. I would rather see the result with a short note from the doctor, even if it says "normal, no action needed".
I: Anything else about the app you want to mention?
P2: The text is very small. My eyes are fine, but my mum could never read it, and the buttons are tiny. If they want older people to use it the design needs bigger text and fewer steps.

# P3
I: When did you last use the surgery app?
P3: Last week, to order my repeat prescription. I take medication for my blood pressure, and the repeat prescription request is the only reason I keep the app. It is genuinely seamless. Two taps and it goes to the pharmacy I picked.
I: And how do you know when the prescription is ready?
P3: The pharmacy sends a text when it is ready to collect, so that part works. But the app itself still says "request sent" for days. I don't know if the doctor approved it or not. Sometimes I phone the pharmacy to check, which is silly.
I: Have you booked appointments through it?
P3: I tried. There were no appointments, just a message to call at eight. I called at eight, waited forty minutes in the phone queue, and got the last slot. It felt like winning a lottery, and I don't think getting healthcare should feel like that.
I: How do you log in?
P3: Face login on my phone, which is great when it works. But after every update it forgets me and I have to enter my password and a verification code by email. The email code sometimes lands in spam, so I sit there refreshing my inbox.
I: What do you think about the app holding your health records?
P3: I am fine with it, mostly. I trust the surgery. What I don't love is not knowing who can see my records. Is it just my doctor, or the pharmacy, or the app company? There is a privacy page but it is long and confusing.
I: If you could change one thing, what would it be?
P3: Tell me what is happening after I request something. A simple status like "approved by doctor" and "ready at the pharmacy" would stop all the phone calls and the guessing.

# P4
I: Could you walk me through the last time you tried to get an appointment?
P4: My son had a high temperature, so I opened the app first thing. No appointments, as usual. Then I joined the eight o'clock phone queue while getting him dressed for school. By the time I reached the receptionist they only had a telephone appointment for the afternoon.
I: How was that for you?
P4: Stressful. It is the same scramble every time and you feel guilty for calling. I'd love to just see the available slots in the app and pick one, like booking a table at a restaurant.
I: Do you use any other part of the app?
P4: I order repeat prescriptions for my son's asthma inhaler. It is easy enough to request, but I never know when it is ready. Last month I made two trips to the pharmacy before the medication was there to collect.
I: What about logging in?
P4: I got locked out once after typing the wrong password three times. The verification code went to an old phone number, so I had to visit the surgery in person to fix my account. It took a week to sort.
I: How did you feel about that?
P4: Annoyed. It is my own health record and I could not get into it. The security makes sense, but there was no way to update the phone number myself.
I: Do you get any reminders from the surgery?
P4: Sometimes a text reminder the day before an appointment, which is helpful. I would like the same for prescriptions and for my son's vaccinations. Reminders would stop me forgetting things.
I: Anything you particularly like?
P4: The repeat prescription screen is clear, and I like that I can choose my pharmacy. When it works it really does save time.

# P5
I: What do you mainly use the surgery app for?
P5: Mostly repeat prescriptions. I have three medications and I request them every month. The request part is simple. The waiting is the problem, because I don't know when the pharmacy has them ready to collect.
I: Have you tried to book an appointment?
P5: A couple of times, but there were never any appointments available in the app. I gave up and now I just ring at eight. The phone queue is horrible, but at least you eventually speak to a person.
I: How do you get into the app?
P5: I use a password manager, so logging in is fine for me. The verification code arrives by text within a few seconds. I know other people struggle, but I have not had a problem.
I: What do you think about notifications from the app?
P5: I'd like notifications for prescriptions and test results. At the moment nothing tells you anything, so you have to keep checking the app or phone the surgery.
I: How do you feel about your records being online?
P5: A bit uneasy. I read about data being shared with companies, and the app does not explain who sees my records. I would like a simple page that says exactly who can see what.
I: Is there anything else?
P5: The design is dated and the text is small, but it does the job for prescriptions. For appointments it is basically useless.

# P6
I: Tell me about the last time you contacted your surgery.
P6: I needed blood test results after a check-up. The app showed a message saying results were available and to contact the surgery, with no detail. I spent the evening worrying, then rang the next morning and joined the eight o'clock phone queue.
I: What happened on the call?
P6: The receptionist read out that my results were normal. All that worry for a normal result. If the app had just shown the result with a note from the doctor, I would have slept fine.
I: Do you book appointments in the app?
P6: I tried once. No appointments showing, so I gave up and called. It feels like the appointments in the app are a myth. The phone is the only real way in.
I: What about prescriptions?
P6: I don't take regular medication, so I have not used the repeat prescription part. My partner uses it and says it is easy, but she never knows when the pharmacy has it ready.
I: How do you log in?
P6: Password and a verification code by text. The code is usually quick. Once it did not arrive at all, and I had to wait ten minutes and request another code. Not a disaster, just annoying.
I: What would make the app better for you?
P6: Show me real appointments I can book, and show me test results with a plain explanation. Also tell me who can see my records, because I worry about privacy with health data.
`;

export const EXAMPLE_CODES = [
  { id: 'c1', name: 'Eight o’clock phone scramble', definition: 'Calling the surgery at opening time and competing with other patients for same-day appointments.', include: 'Phone queues at 8am, racing for slots, being told to call back tomorrow.', exclude: 'Phoning for other reasons, such as checking a prescription (use Phones to check status).' },
  { id: 'c2', name: 'No appointments in the app', definition: 'The app shows no bookable appointments, or only routine ones weeks away, when the person needs one.', include: 'Empty appointment pages, messages telling them to call instead.', exclude: 'Complaints about the phone line itself (use Eight o’clock phone scramble).' },
  { id: 'c3', name: 'Booking for someone else', definition: 'Managing appointments, results or prescriptions on behalf of a family member through proxy access.', include: 'Parents, children, partners; switching accounts.', exclude: 'Talking about another person’s experience without acting for them.' },
  { id: 'c4', name: 'Login friction', definition: 'Effort, errors or lock-outs when signing in: passwords, resets, face login forgetting the user.', include: 'Password resets, lock-outs, being logged out after updates.', exclude: 'Delays in receiving the code itself (use Verification code delays).' },
  { id: 'c5', name: 'Verification code delays', definition: 'The one-time code arrives late, expires, goes to spam or to an old number.', include: 'Text and email codes.', exclude: '' },
  { id: 'c6', name: 'Repeat prescriptions are easy', definition: 'Requesting a repeat prescription in the app is described as quick or simple.', include: 'Positive remarks about the request step.', exclude: 'What happens after the request (use Unsure if it went through).' },
  { id: 'c7', name: 'Unsure if it went through', definition: 'After acting in the app, the person cannot tell what happened next or whether it worked.', include: '“Request sent” and nothing else; not knowing if approved or ready.', exclude: 'Waiting for test results (use Results without explanation).' },
  { id: 'c8', name: 'Wants notifications', definition: 'Asks for the app or surgery to tell them proactively when something changes.', include: 'Texts, push notifications, reminders.', exclude: '' },
  { id: 'c9', name: 'Results without explanation', definition: 'Test results are flagged as available with no content or context, causing worry until someone explains.', include: '', exclude: '' },
  { id: 'c10', name: '“felt like a lottery”', definition: 'In-vivo code: getting an appointment depends on luck and timing rather than need.', include: 'Lottery, winning, scramble metaphors.', exclude: '', inVivo: true },
  { id: 'c11', name: 'Phones to check status', definition: 'Uses the phone or a visit as a workaround because the app does not give the answer or action they need.', include: 'Calling the pharmacy or receptionist to check or fix something.', exclude: 'The 8am appointment call (use Eight o’clock phone scramble).' },
  { id: 'c12', name: 'Who can see my records', definition: 'Uncertainty or concern about who has access to health records held in the app.', include: '', exclude: '' },
  { id: 'c13', name: 'Small text and buttons', definition: 'Text or controls too small to read or tap comfortably, especially for older users.', include: '', exclude: '' },
];
export const EXAMPLE_CATEGORIES = [
  { id: 't1', name: 'Getting seen is a lottery', description: 'People cannot get timely appointments through the app, so access depends on winning the 8am phone race.', conditions: 'Same-day need; no appointments released to the app.', context: 'Mornings, work and school runs, illness.', actions: 'Open the app, find nothing, join the phone queue, take whatever slot is left.', consequences: 'Stress, time off work, the app seen as only for people who are not ill.' },
  { id: 't2', name: 'Left guessing after acting', description: 'After requesting something, people get no status, so they phone, visit or worry.', conditions: 'Requests and results with a single “sent” or “available” message.', context: 'Prescriptions, test results.', actions: 'Phone the pharmacy or surgery, make wasted trips, refresh the app.', consequences: 'Worry, wasted trips, extra calls for the surgery.' },
  { id: 't3', name: 'Getting in is the hard part', description: 'Signing in and verification block access to an app people otherwise rely on.', conditions: '', context: '', actions: '', consequences: '' },
  { id: 't4', name: 'Caring for others through the app', description: 'Carers manage relatives’ health through proxy access, which the app makes awkward.', conditions: '', context: '', actions: '', consequences: '' },
];
const C = (iv, phrase, codes) => ({ iv, phrase, codes });
export const EXAMPLE_CODING = [
  C('P1', 'there were no appointments showing at all', ['c2']),
  C('P1', 'number twenty-three in the phone queue', ['c1', 'c10']),
  C('P1', 'Frustrated, mostly', ['c1', 'c2']),
  C('P1', 'I can never remember my password', ['c4', 'c5']),
  C('P1', 'that part is actually great', ['c6']),
  C('P1', "That's the bit I'm not sure about", ['c7']),
  C('P1', 'A notification when the prescription', ['c8', 'c7']),
  C('P2', 'I book for my mum', ['c3']),
  C('P2', 'juggling two accounts', ['c3', 'c4']),
  C('P2', 'I just phone the surgery anyway', ['c11', 'c3']),
  C('P2', 'The appointments page only shows routine slots', ['c2', 'c1']),
  C('P2', 'results available, please contact the surgery', ['c9', 'c3']),
  C('P2', 'Anxious, honestly', ['c9']),
  C('P2', 'The text is very small', ['c13', 'c3']),
  C('P3', 'genuinely seamless', ['c6']),
  C('P3', 'still says "request sent" for days', ['c7', 'c11']),
  C('P3', 'It felt like winning a lottery', ['c2', 'c1', 'c10']),
  C('P3', 'Face login on my phone', ['c4', 'c5']),
  C('P3', 'not knowing who can see my records', ['c12']),
  C('P3', 'A simple status like', ['c7', 'c8']),
  C('P4', 'No appointments, as usual', ['c2', 'c1', 'c3']),
  C('P4', 'same scramble every time', ['c1', 'c10']),
  C('P4', "my son's asthma inhaler", ['c6', 'c7', 'c3']),
  C('P4', 'locked out once', ['c4', 'c5']),
  C('P4', 'It is my own health record', ['c4']),
  C('P4', 'text reminder the day before', ['c8']),
  C('P4', 'The repeat prescription screen is clear', ['c6']),
  C('P5', 'Mostly repeat prescriptions', ['c6', 'c7']),
  C('P5', 'never any appointments available', ['c2', 'c1']),
  C('P5', "I'd like notifications", ['c8']),
];
export const EXAMPLE_MEMOS = {
  codes: {
    c10: 'Three people reached for luck or competition metaphors without prompting. Compare with how they talk about prescriptions, where the language is calm and procedural.',
    c7: 'Same pattern across prescriptions and results: the app confirms the user’s action but not the system’s. Is this one code or two? Keep together for now; revisit after P6.',
  },
  segments: {},
};
export const EXAMPLE_STORYLINE = 'People value the app for the routine, predictable task of re-ordering medication, but for anything uncertain (getting seen, results, whether a request worked) the app confirms the action and then goes quiet. They fill the silence with phone calls, visits and worry. Access to care feels like a lottery because the app hides the one thing they need: what happens next.';
// Sarcasm the word list misreads, corrected by hand to show overrides.
export const EXAMPLE_OVERRIDES = [{ iv: 'P6', phrase: 'All that worry for a normal result', label: 'negative' }];
export const EXAMPLE_STARRED = [{ iv: 'P1', phrase: 'number twenty-three in the phone queue' }, { iv: 'P2', phrase: 'Anxious, honestly' }];

// The example as a project: split, then attach codes by phrase.
export function exampleProject(base) {
  const interviews = prepare(EXAMPLE_TEXT, base.options);
  const find = (iv, phrase) => interviews.find((x) => x.name === iv)?.segments.find((s) => s.text.includes(phrase))?.id;
  const coding = {};
  for (const c of EXAMPLE_CODING) { const id = find(c.iv, c.phrase); if (id) coding[id] = [...c.codes]; }
  const segMemos = {}; const p1 = find('P1', 'that part is actually great');
  if (p1) segMemos[p1] = 'Contrast: the only time P1 sounds pleased. Prescriptions are routine and predictable; appointments are not.';
  return {
    ...base, raw: EXAMPLE_TEXT, interviews,
    codes: EXAMPLE_CODES.map((c) => ({ include: '', exclude: '', memo: EXAMPLE_MEMOS.codes[c.id] || '', category: '', inVivo: false, ...c,
      category: { c1: 't1', c2: 't1', c10: 't1', c11: 't2', c7: 't2', c8: 't2', c9: 't2', c4: 't3', c5: 't3', c13: 't3', c3: 't4' }[c.id] || '' })),
    categories: EXAMPLE_CATEGORIES.map((c) => ({ memo: '', ...c })),
    coding, segMemos,
    starred: Object.fromEntries(EXAMPLE_STARRED.map((s) => [find(s.iv, s.phrase), true]).filter(([k]) => k)),
    overrides: Object.fromEntries(EXAMPLE_OVERRIDES.map((o) => [find(o.iv, o.phrase), o.label]).filter(([k]) => k)),
    core: 't2', storyline: EXAMPLE_STORYLINE, stop: 'app surgery',
  };
}
