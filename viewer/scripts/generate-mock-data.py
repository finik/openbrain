#!/usr/bin/env python3
"""Generate mock-data.json for Open Brain viewer demo mode.

Uses sentence-transformers to embed ~200 famous quotes,
computes pairwise cosine similarity, and stores top-N neighbors.
"""

import json
import uuid
import random
from datetime import datetime, timedelta
from sentence_transformers import SentenceTransformer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np

# ── Famous quotes with authors ──────────────────────────────────────────────
QUOTES = [
    # Philosophy & Wisdom
    ("The unexamined life is not worth living.", "Socrates"),
    ("I think, therefore I am.", "René Descartes"),
    ("The only thing I know is that I know nothing.", "Socrates"),
    ("To be is to be perceived.", "George Berkeley"),
    ("Man is condemned to be free.", "Jean-Paul Sartre"),
    ("One cannot step twice in the same river.", "Heraclitus"),
    ("The mind is everything. What you think you become.", "Buddha"),
    ("Happiness is the highest good.", "Aristotle"),
    ("He who has a why to live can bear almost any how.", "Friedrich Nietzsche"),
    ("The life of man is solitary, poor, nasty, brutish, and short.", "Thomas Hobbes"),
    ("We are what we repeatedly do. Excellence is not an act but a habit.", "Aristotle"),
    ("There is nothing permanent except change.", "Heraclitus"),
    ("The only true wisdom is in knowing you know nothing.", "Socrates"),
    ("Entities should not be multiplied without necessity.", "William of Ockham"),
    ("I can control my passions and emotions if I can understand their nature.", "Spinoza"),
    ("Whereof one cannot speak, thereof one must be silent.", "Ludwig Wittgenstein"),
    ("God is dead. God remains dead. And we have killed him.", "Friedrich Nietzsche"),
    ("The mind is furnished with ideas by experience alone.", "John Locke"),
    ("Existence precedes essence.", "Jean-Paul Sartre"),
    ("Liberty consists in doing what one desires.", "John Stuart Mill"),

    # Science & Discovery
    ("Imagination is more important than knowledge.", "Albert Einstein"),
    ("The important thing is to not stop questioning.", "Albert Einstein"),
    ("Nothing in life is to be feared, it is only to be understood.", "Marie Curie"),
    ("If I have seen further it is by standing on the shoulders of giants.", "Isaac Newton"),
    ("The good thing about science is that it's true whether or not you believe in it.", "Neil deGrasse Tyson"),
    ("Somewhere, something incredible is waiting to be known.", "Carl Sagan"),
    ("The cosmos is within us. We are made of star-stuff.", "Carl Sagan"),
    ("In the middle of difficulty lies opportunity.", "Albert Einstein"),
    ("Everything should be made as simple as possible, but not simpler.", "Albert Einstein"),
    ("Two things are infinite: the universe and human stupidity; I'm not sure about the universe.", "Albert Einstein"),
    ("Science is organized knowledge. Wisdom is organized life.", "Immanuel Kant"),
    ("The saddest aspect of life right now is that science gathers knowledge faster than society gathers wisdom.", "Isaac Asimov"),
    ("An expert is a person who has made all the mistakes that can be made in a very narrow field.", "Niels Bohr"),
    ("The measure of intelligence is the ability of change.", "Albert Einstein"),
    ("It is strange that only extraordinary men make the discoveries which later appear so easy and simple.", "Georg Lichtenberg"),
    ("Research is what I'm doing when I don't know what I'm doing.", "Wernher von Braun"),
    ("Not only is the universe stranger than we imagine, it is stranger than we can imagine.", "Arthur Eddington"),
    ("The most incomprehensible thing about the world is that it is comprehensible.", "Albert Einstein"),
    ("I have not failed. I've just found 10,000 ways that won't work.", "Thomas Edison"),
    ("Genius is one percent inspiration and ninety-nine percent perspiration.", "Thomas Edison"),

    # Literature & Art
    ("To be, or not to be, that is the question.", "William Shakespeare"),
    ("All that glitters is not gold.", "William Shakespeare"),
    ("It was the best of times, it was the worst of times.", "Charles Dickens"),
    ("In three words I can sum up everything I learned about life: it goes on.", "Robert Frost"),
    ("Not all those who wander are lost.", "J.R.R. Tolkien"),
    ("The only way out of the labyrinth of suffering is to forgive.", "John Green"),
    ("It is never too late to be what you might have been.", "George Eliot"),
    ("Stay hungry, stay foolish.", "Stewart Brand"),
    ("So we beat on, boats against the current, borne back ceaselessly into the past.", "F. Scott Fitzgerald"),
    ("All we have to decide is what to do with the time that is given us.", "J.R.R. Tolkien"),
    ("The world breaks everyone, and afterward, some are strong at the broken places.", "Ernest Hemingway"),
    ("Every saint has a past, and every sinner has a future.", "Oscar Wilde"),
    ("Be yourself; everyone else is already taken.", "Oscar Wilde"),
    ("To live is the rarest thing in the world. Most people exist, that is all.", "Oscar Wilde"),
    ("We are all in the gutter, but some of us are looking at the stars.", "Oscar Wilde"),
    ("It does not do to dwell on dreams and forget to live.", "J.K. Rowling"),
    ("There is no greater agony than bearing an untold story inside you.", "Maya Angelou"),
    ("The only people for me are the mad ones.", "Jack Kerouac"),
    ("One must imagine Sisyphus happy.", "Albert Camus"),
    ("In the depth of winter, I finally learned that within me there lay an invincible summer.", "Albert Camus"),

    # Leadership & Politics
    ("The only thing we have to fear is fear itself.", "Franklin D. Roosevelt"),
    ("Ask not what your country can do for you — ask what you can do for your country.", "John F. Kennedy"),
    ("I have a dream.", "Martin Luther King Jr."),
    ("Injustice anywhere is a threat to justice everywhere.", "Martin Luther King Jr."),
    ("The arc of the moral universe is long, but it bends toward justice.", "Martin Luther King Jr."),
    ("Power tends to corrupt, and absolute power corrupts absolutely.", "Lord Acton"),
    ("Those who would give up essential liberty to purchase a little temporary safety deserve neither.", "Benjamin Franklin"),
    ("Government of the people, by the people, for the people, shall not perish from the earth.", "Abraham Lincoln"),
    ("In the end, we will remember not the words of our enemies, but the silence of our friends.", "Martin Luther King Jr."),
    ("The only thing necessary for the triumph of evil is for good men to do nothing.", "Edmund Burke"),
    ("Give me liberty, or give me death.", "Patrick Henry"),
    ("Never doubt that a small group of thoughtful committed citizens can change the world.", "Margaret Mead"),
    ("Democracy is the worst form of government, except for all the others.", "Winston Churchill"),
    ("We shall fight on the beaches. We shall never surrender.", "Winston Churchill"),
    ("Success is not final, failure is not fatal: it is the courage to continue that counts.", "Winston Churchill"),
    ("You must be the change you wish to see in the world.", "Mahatma Gandhi"),
    ("An eye for an eye only ends up making the whole world blind.", "Mahatma Gandhi"),
    ("The best argument against democracy is a five-minute conversation with the average voter.", "Winston Churchill"),
    ("A nation that destroys its soils destroys itself.", "Franklin D. Roosevelt"),
    ("Nearly all men can stand adversity, but if you want to test a man's character, give him power.", "Abraham Lincoln"),

    # Technology & Innovation
    ("The best way to predict the future is to invent it.", "Alan Kay"),
    ("Any sufficiently advanced technology is indistinguishable from magic.", "Arthur C. Clarke"),
    ("The computer was born to solve problems that did not exist before.", "Bill Gates"),
    ("Move fast and break things.", "Mark Zuckerberg"),
    ("Innovation distinguishes between a leader and a follower.", "Steve Jobs"),
    ("Your time is limited, don't waste it living someone else's life.", "Steve Jobs"),
    ("The people who are crazy enough to think they can change the world are the ones who do.", "Steve Jobs"),
    ("Talk is cheap. Show me the code.", "Linus Torvalds"),
    ("Programs must be written for people to read, and only incidentally for machines to execute.", "Harold Abelson"),
    ("The most dangerous phrase in the language is: we've always done it this way.", "Grace Hopper"),
    ("Simplicity is the ultimate sophistication.", "Leonardo da Vinci"),
    ("First, solve the problem. Then, write the code.", "John Johnson"),
    ("Code is like humor. When you have to explain it, it's bad.", "Cory House"),
    ("The function of good software is to make the complex appear to be simple.", "Grady Booch"),
    ("Measuring programming progress by lines of code is like measuring aircraft building progress by weight.", "Bill Gates"),
    ("Before software can be reusable it first has to be usable.", "Ralph Johnson"),
    ("Perfection is achieved not when there is nothing more to add, but when there is nothing left to take away.", "Antoine de Saint-Exupéry"),
    ("The Internet is becoming the town square for the global village of tomorrow.", "Bill Gates"),
    ("We are stuck with technology when what we really want is just stuff that works.", "Douglas Adams"),
    ("Technology is a useful servant but a dangerous master.", "Christian Lous Lange"),

    # Psychology & Human Nature
    ("Until you make the unconscious conscious, it will direct your life and you will call it fate.", "Carl Jung"),
    ("Knowing your own darkness is the best method for dealing with the darknesses of other people.", "Carl Jung"),
    ("The shoe that fits one person pinches another; there is no recipe for living that suits all cases.", "Carl Jung"),
    ("Between stimulus and response there is a space. In that space is our freedom to choose.", "Viktor Frankl"),
    ("When we are no longer able to change a situation, we are challenged to change ourselves.", "Viktor Frankl"),
    ("Everything can be taken from a man but one thing: to choose one's attitude in any given circumstances.", "Viktor Frankl"),
    ("The curious paradox is that when I accept myself just as I am, then I can change.", "Carl Rogers"),
    ("What a man can be, he must be. This need we call self-actualization.", "Abraham Maslow"),
    ("The greatest discovery of my generation is that a human being can alter his life by altering his attitudes.", "William James"),
    ("Unexpressed emotions will never die. They are buried alive and will come forth later in uglier ways.", "Sigmund Freud"),
    ("People are not disturbed by things, but by the views they take of them.", "Epictetus"),
    ("No man is free who is not master of himself.", "Epictetus"),
    ("Happiness is not something ready made. It comes from your own actions.", "Dalai Lama"),
    ("The mind is its own place, and in itself can make a heaven of hell, a hell of heaven.", "John Milton"),
    ("Courage is not the absence of fear, but the triumph over it.", "Nelson Mandela"),
    ("Education is the most powerful weapon which you can use to change the world.", "Nelson Mandela"),
    ("It always seems impossible until it's done.", "Nelson Mandela"),
    ("What lies behind us and what lies before us are tiny matters compared to what lies within us.", "Ralph Waldo Emerson"),
    ("Trust thyself: every heart vibrates to that iron string.", "Ralph Waldo Emerson"),
    ("The only person you are destined to become is the person you decide to be.", "Ralph Waldo Emerson"),

    # Business & Economics
    ("Time is money.", "Benjamin Franklin"),
    ("The secret of getting ahead is getting started.", "Mark Twain"),
    ("Whenever you find yourself on the side of the majority, it is time to pause and reflect.", "Mark Twain"),
    ("The reports of my death are greatly exaggerated.", "Mark Twain"),
    ("A banker is a fellow who lends you his umbrella when the sun is shining and wants it back when it starts to rain.", "Mark Twain"),
    ("Price is what you pay. Value is what you get.", "Warren Buffett"),
    ("Rule No. 1: Never lose money. Rule No. 2: Never forget rule No. 1.", "Warren Buffett"),
    ("Be fearful when others are greedy and greedy when others are fearful.", "Warren Buffett"),
    ("It takes 20 years to build a reputation and five minutes to ruin it.", "Warren Buffett"),
    ("The stock market is a device for transferring money from the impatient to the patient.", "Warren Buffett"),
    ("Compound interest is the eighth wonder of the world.", "Albert Einstein"),
    ("The invisible hand of the market will always move faster than the visible hand of government.", "Adam Smith"),
    ("Capitalism without bankruptcy is like Christianity without hell.", "Frank Borman"),
    ("The four most dangerous words in investing are: this time it's different.", "John Templeton"),
    ("In the short run, the market is a voting machine but in the long run, it is a weighing machine.", "Benjamin Graham"),
    ("Risk comes from not knowing what you're doing.", "Warren Buffett"),
    ("The individual investor should act consistently as an investor and not as a speculator.", "Benjamin Graham"),
    ("Annual income twenty pounds, annual expenditure nineteen six, result happiness.", "Charles Dickens"),
    ("The lack of money is the root of all evil.", "Mark Twain"),
    ("Formal education will make you a living; self-education will make you a fortune.", "Jim Rohn"),

    # Life & Motivation
    ("Life is what happens when you're busy making other plans.", "John Lennon"),
    ("The purpose of our lives is to be happy.", "Dalai Lama"),
    ("Get busy living or get busy dying.", "Stephen King"),
    ("You only live once, but if you do it right, once is enough.", "Mae West"),
    ("Many of life's failures are people who did not realize how close they were to success when they gave up.", "Thomas Edison"),
    ("The way to get started is to quit talking and begin doing.", "Walt Disney"),
    ("If life were predictable it would cease to be life, and be without flavor.", "Eleanor Roosevelt"),
    ("Life is really simple, but we insist on making it complicated.", "Confucius"),
    ("The greatest glory in living lies not in never falling, but in rising every time we fall.", "Nelson Mandela"),
    ("Do what you can, with what you have, where you are.", "Theodore Roosevelt"),
    ("It is during our darkest moments that we must focus to see the light.", "Aristotle"),
    ("Believe you can and you're halfway there.", "Theodore Roosevelt"),
    ("The best time to plant a tree was 20 years ago. The second best time is now.", "Chinese Proverb"),
    ("Your limitation — it's only your imagination.", "Unknown"),
    ("The harder I work, the luckier I get.", "Gary Player"),
    ("Don't watch the clock; do what it does. Keep going.", "Sam Levenson"),
    ("Everything you've ever wanted is on the other side of fear.", "George Addair"),
    ("Turn your wounds into wisdom.", "Oprah Winfrey"),
    ("What we achieve inwardly will change outer reality.", "Plutarch"),
    ("The mind that opens to a new idea never returns to its original size.", "Albert Einstein"),

    # Bonus — Eastern Wisdom
    ("The journey of a thousand miles begins with a single step.", "Lao Tzu"),
    ("When the student is ready, the teacher will appear.", "Lao Tzu"),
    ("Nature does not hurry, yet everything is accomplished.", "Lao Tzu"),
    ("A man who moves a mountain begins by carrying away small stones.", "Confucius"),
    ("Real knowledge is to know the extent of one's ignorance.", "Confucius"),
    ("Before you embark on a journey of revenge, dig two graves.", "Confucius"),
    ("The best fighter is never angry.", "Lao Tzu"),
    ("Silence is a source of great strength.", "Lao Tzu"),
    ("If you are depressed you are living in the past. If anxious, in the future. If at peace, in the present.", "Lao Tzu"),
    ("Knowing others is intelligence; knowing yourself is true wisdom.", "Lao Tzu"),
]

TOP_N = 15  # neighbors per thought

def main():
    print(f"Loaded {len(QUOTES)} quotes")

    # Generate stable UUIDs from content
    thoughts = []
    random.seed(42)
    base_date = datetime(2025, 1, 1)

    for i, (quote, author) in enumerate(QUOTES):
        tid = str(uuid.uuid5(uuid.NAMESPACE_DNS, quote))
        # Spread dates across a year
        created = base_date + timedelta(days=random.randint(0, 365), hours=random.randint(0, 23), minutes=random.randint(0, 59))
        # Assign types: most are notes, ~20% tasks
        ttype = "task" if random.random() < 0.2 else "note"
        # Build topics from author category
        topics = [author.split()[-1].lower()]

        thoughts.append({
            "id": tid,
            "title": quote,
            "content": f'"{quote}" — {author}',
            "created_at": created.isoformat() + "Z",
            "metadata": {
                "type": ttype,
                "topics": topics,
                "people": [author],
            }
        })

    # Sort by created_at desc (newest first)
    thoughts.sort(key=lambda t: t["created_at"], reverse=True)

    # Generate embeddings
    print("Loading model (all-MiniLM-L6-v2)...")
    model = SentenceTransformer("all-MiniLM-L6-v2")

    texts = [t["content"] for t in thoughts]
    print(f"Embedding {len(texts)} quotes...")
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)

    # Compute pairwise cosine similarity
    print("Computing similarity matrix...")
    sim_matrix = cosine_similarity(embeddings)

    # Build neighbor map: top N for each thought
    print(f"Building neighbor map (top {TOP_N} per thought)...")
    neighbors = {}
    id_list = [t["id"] for t in thoughts]

    for i, tid in enumerate(id_list):
        sims = sim_matrix[i]
        # Get indices sorted by similarity (descending), skip self
        ranked = np.argsort(sims)[::-1]
        top = []
        for j in ranked:
            if j == i:
                continue
            top.append({
                "id": id_list[j],
                "similarity": round(float(sims[j]), 4)
            })
            if len(top) >= TOP_N:
                break
        neighbors[tid] = top

    # Output
    output = {
        "thoughts": thoughts,
        "neighbors": neighbors,
        "total": len(thoughts),
        "generated": datetime.now().isoformat(),
        "model": "all-MiniLM-L6-v2",
    }

    out_path = "js/mock-data.json"
    import os
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(output, f, indent=2)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"Written {out_path} ({size_kb:.0f} KB, {len(thoughts)} thoughts, {sum(len(v) for v in neighbors.values())} neighbor entries)")


def _topic_from_index(i):
    """Map quote index to a broad topic label."""
    categories = [
        "wisdom", "wisdom", "science", "science",
        "literature", "literature", "leadership", "leadership",
        "technology", "technology", "psychology", "psychology",
        "business", "business", "life", "life", "eastern wisdom",
    ]
    bucket = i // 20
    if bucket < len(categories):
        return categories[bucket]
    return "life"


if __name__ == "__main__":
    main()
