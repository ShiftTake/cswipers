import React, { useEffect, useState } from 'react';
import { addDoc, collection, getDocs, limit, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import logo from './assets/cardswipers-logo.svg';

const INITIAL_DECK = [
  {
    id: 1,
    title: '2023 Bowman Chrome Elly De La Cruz',
    type: 'Sports',
    brand: 'Bowman',
    condition: 'PSA 10 Gem Mint',
    imageEmoji: '⚾',
    owner: 'CollectorTexas99',
    lookingFor: 'High-end Pokemon TCG or Vintage Sports',
    cardColor: 'from-amber-500/20 to-red-600/20',
    borderColor: 'border-amber-500/40'
  },
  {
    id: 2,
    title: 'Charizard ex #223 Special Illustration',
    type: 'TCG',
    brand: 'Pokemon',
    condition: 'Raw / Mint',
    imageEmoji: '🔥',
    owner: 'PalletTownTrades',
    lookingFor: 'Topps Chrome Football Rookies',
    cardColor: 'from-red-600/20 to-orange-500/20',
    borderColor: 'border-red-500/40'
  },
  {
    id: 3,
    title: '1952 Topps Mickey Mantle (Reprint Edition)',
    type: 'Sports',
    brand: 'Topps',
    condition: 'SGC 9',
    imageEmoji: '🧢',
    owner: 'VintageVault',
    lookingFor: 'Cash or equivalent high-tier Yu-Gi-Oh lots',
    cardColor: 'from-blue-600/20 to-neutral-700/20',
    borderColor: 'border-blue-400/40'
  }
];

export default function CardSwipersLanding() {
  const [currentTab, setCurrentTab] = useState('swipe');
  const [deck, setDeck] = useState(INITIAL_DECK);
  const [myCollection, setMyCollection] = useState([
    { id: 101, name: '1st Edition Blue-Eyes White Dragon', brand: 'Yu-Gi-Oh!', condition: 'PSA 9' },
    { id: 102, name: '2024 Shohei Ohtani Topps Chrome', brand: 'Topps', condition: 'Raw' }
  ]);
  const [messages, setMessages] = useState([
    { id: 1, user: 'PalletTownTrades', lastMsg: 'Hey! Down to trade Charizard for your Blue-Eyes?', unread: true },
    { id: 2, user: 'VintageVault', lastMsg: 'Is that price firm on the Ohtani?', unread: false }
  ]);
  const [activeChat, setActiveChat] = useState(null);

  const [newCard, setNewCard] = useState({ name: '', brand: 'Topps', condition: 'Raw', lookingFor: '' });
  const [chatDraft, setChatDraft] = useState('');

  useEffect(() => {
    const loadPersistedData = async () => {
      try {
        const cardsQuery = query(collection(db, 'cards'), orderBy('createdAt', 'desc'), limit(50));
        const messagesQuery = query(collection(db, 'messages'), orderBy('updatedAt', 'desc'), limit(50));

        const [cardsSnapshot, messagesSnapshot] = await Promise.all([
          getDocs(cardsQuery),
          getDocs(messagesQuery)
        ]);

        if (!cardsSnapshot.empty) {
          const loadedCards = cardsSnapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              name: data.name,
              brand: data.brand,
              condition: data.condition
            };
          });
          setMyCollection(loadedCards);
        }

        if (!messagesSnapshot.empty) {
          const loadedMessages = messagesSnapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              user: data.user,
              lastMsg: data.lastMsg,
              unread: Boolean(data.unread)
            };
          });
          setMessages(loadedMessages);
        }
      } catch (error) {
        console.error('Failed to load Firestore data:', error);
      }
    };

    loadPersistedData();
  }, []);

  const handleSwipe = async (direction) => {
    const topCard = deck[0];
    if (!topCard) return;

    try {
      await addDoc(collection(db, 'swipes'), {
        cardId: topCard.id,
        title: topCard.title,
        direction,
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Failed to persist swipe:', error);
    }

    if (direction === 'right') {
      alert(`Liked ${topCard.title}! If they swipe right on your collection, it's a Trade Match.`);
    }

    setDeck((prevDeck) => prevDeck.slice(1));
  };

  const handlePostCard = async (e) => {
    e.preventDefault();
    if (!newCard.name) return;

    let createdId = Date.now();

    try {
      const docRef = await addDoc(collection(db, 'cards'), {
        name: newCard.name,
        brand: newCard.brand,
        condition: newCard.condition,
        lookingFor: newCard.lookingFor,
        createdAt: serverTimestamp()
      });
      createdId = docRef.id;
    } catch (error) {
      console.error('Failed to persist posted card:', error);
    }

    setMyCollection((prevCollection) => [
      { id: createdId, name: newCard.name, brand: newCard.brand, condition: newCard.condition },
      ...prevCollection
    ]);

    setNewCard({ name: '', brand: 'Topps', condition: 'Raw', lookingFor: '' });
    setCurrentTab('collection');
  };

  const handleSendMessage = async () => {
    const trimmedMessage = chatDraft.trim();
    if (!activeChat || !trimmedMessage) return;

    let messageId = Date.now();

    try {
      const docRef = await addDoc(collection(db, 'messages'), {
        user: activeChat.user,
        lastMsg: trimmedMessage,
        unread: false,
        updatedAt: serverTimestamp()
      });
      messageId = docRef.id;
    } catch (error) {
      console.error('Failed to persist message:', error);
    }

    setMessages((prevMessages) => [
      { id: messageId, user: activeChat.user, lastMsg: trimmedMessage, unread: false },
      ...prevMessages.filter((msg) => msg.user !== activeChat.user)
    ]);
    setActiveChat((prevChat) => (prevChat ? { ...prevChat, lastMsg: trimmedMessage, unread: false } : prevChat));
    setChatDraft('');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white font-sans flex flex-col justify-between max-w-md mx-auto border-x border-neutral-900 shadow-2xl relative">
      <header className="bg-neutral-900/80 backdrop-blur-md px-6 py-4 flex items-center justify-between border-b border-neutral-800 sticky top-0 z-50">
        <div className="flex items-center space-x-2">
          <img src={logo} alt="CardSwipers logo" className="w-8 h-8 rounded-lg shadow-md shadow-red-600/30" />
          <span className="text-lg font-bold tracking-tight">
            card<span className="text-[#E50914]">swipers</span>
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <button onClick={() => setCurrentTab('messages')} className="relative p-1" type="button">
            <span className="text-xl">💬</span>
            {messages.some((m) => m.unread) && (
              <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-[#E50914] rounded-full ring-2 ring-neutral-900"></span>
            )}
          </button>
        </div>
      </header>

      <main className="flex-grow p-4 overflow-y-auto">
        {currentTab === 'swipe' && (
          <div className="h-full flex flex-col justify-between items-center py-4">
            {deck.length > 0 ? (
              <div className="w-full space-y-6">
                <div className="w-full h-[440px] bg-neutral-900 border border-neutral-800 rounded-[32px] p-4 flex flex-col justify-between relative overflow-hidden shadow-xl">
                  <div className={`absolute inset-0 bg-gradient-to-b ${deck[0].cardColor} opacity-40 pointer-events-none`} />

                  <div className="flex justify-between items-center z-10">
                    <span className="bg-black/60 backdrop-blur-md text-[11px] font-bold px-3 py-1 rounded-full border border-white/10 uppercase tracking-wider text-neutral-300">
                      {deck[0].brand}
                    </span>
                    <span className="bg-[#E50914] text-white text-[11px] font-extrabold px-3 py-1 rounded-full uppercase tracking-wider shadow-sm">
                      {deck[0].condition}
                    </span>
                  </div>

                  <div className={`w-44 h-60 mx-auto bg-neutral-950 border ${deck[0].borderColor} rounded-2xl flex flex-col items-center justify-center shadow-2xl relative z-10`}>
                    <span className="text-6xl animate-pulse">{deck[0].imageEmoji}</span>
                    <div className="absolute bottom-3 text-[10px] uppercase tracking-widest text-neutral-500 font-bold">
                      Verified Asset
                    </div>
                  </div>

                  <div className="z-10 space-y-1 bg-gradient-to-t from-neutral-950 via-neutral-950/80 to-transparent p-2 rounded-xl">
                    <p className="text-xs text-[#E50914] font-semibold">@{deck[0].owner}</p>
                    <h2 className="text-xl font-black truncate">{deck[0].title}</h2>
                    <p className="text-xs text-neutral-400 font-medium leading-relaxed truncate">
                      <span className="text-white font-bold">ISO:</span> {deck[0].lookingFor}
                    </p>
                  </div>
                </div>

                <div className="flex justify-center items-center space-x-6">
                  <button
                    onClick={() => handleSwipe('left')}
                    className="w-14 h-14 rounded-full bg-neutral-900 border border-neutral-800 text-red-500 font-bold text-xl shadow-lg hover:scale-105 active:scale-95 transition-transform"
                    type="button"
                  >
                    ✕
                  </button>
                  <button
                    onClick={() => handleSwipe('right')}
                    className="w-14 h-14 rounded-full bg-[#E50914] text-white font-bold text-xl shadow-lg shadow-red-600/20 hover:scale-105 active:scale-95 transition-transform"
                    type="button"
                  >
                    ❤️
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-20 space-y-4">
                <span className="text-5xl">🃏</span>
                <h3 className="text-xl font-bold">End of the Deck!</h3>
                <p className="text-sm text-neutral-500 max-w-xs">
                  No more collectors matching your filters in your radius. Try expanding your search options.
                </p>
              </div>
            )}
          </div>
        )}

        {currentTab === 'post' && (
          <div className="space-y-6 py-2">
            <div>
              <h2 className="text-2xl font-black">List a Card</h2>
              <p className="text-xs text-neutral-500">Add an asset to your binder to start matching trades.</p>
            </div>

            <form onSubmit={handlePostCard} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-400 uppercase">Card Identity</label>
                <input
                  type="text"
                  placeholder="e.g., 2018 Shohei Ohtani Rookie Card"
                  value={newCard.name}
                  onChange={(e) => setNewCard({ ...newCard, name: e.target.value })}
                  className="w-full p-4 bg-neutral-900 border border-neutral-800 rounded-2xl focus:outline-none focus:border-[#E50914] text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-400 uppercase">Brand/Publisher</label>
                  <select
                    value={newCard.brand}
                    onChange={(e) => setNewCard({ ...newCard, brand: e.target.value })}
                    className="w-full p-4 bg-neutral-900 border border-neutral-800 rounded-2xl focus:outline-none focus:border-[#E50914] text-sm"
                  >
                    <option>Topps</option>
                    <option>Bowman</option>
                    <option>Panini</option>
                    <option>Pokemon</option>
                    <option>Yu-Gi-Oh!</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-neutral-400 uppercase">Card Condition</label>
                  <select
                    value={newCard.condition}
                    onChange={(e) => setNewCard({ ...newCard, condition: e.target.value })}
                    className="w-full p-4 bg-neutral-900 border border-neutral-800 rounded-2xl focus:outline-none focus:border-[#E50914] text-sm"
                  >
                    <option>Raw / Mint</option>
                    <option>PSA 10 Gem Mint</option>
                    <option>PSA 9 Mint</option>
                    <option>BGS 9.5 Pristine</option>
                    <option>SGC 10</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-400 uppercase">In Search Of (ISO)</label>
                <input
                  type="text"
                  placeholder="What collectibles do you want in exchange?"
                  value={newCard.lookingFor}
                  onChange={(e) => setNewCard({ ...newCard, lookingFor: e.target.value })}
                  className="w-full p-4 bg-neutral-900 border border-neutral-800 rounded-2xl focus:outline-none focus:border-[#E50914] text-sm"
                />
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-[#E50914] hover:bg-red-700 font-bold rounded-2xl shadow-lg shadow-red-600/10 transition-colors text-sm mt-4"
              >
                Publish Asset to Feed
              </button>
            </form>
          </div>
        )}

        {currentTab === 'collection' && (
          <div className="space-y-6 py-2">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-black">My Trading Binder</h2>
                <p className="text-xs text-neutral-500">Your public inventory up for trade.</p>
              </div>
              <button onClick={() => setCurrentTab('post')} className="bg-[#E50914] text-white text-xs font-bold px-3 py-2 rounded-xl" type="button">
                + Add
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {myCollection.map((card) => (
                <div
                  key={card.id}
                  className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between h-40 relative group"
                >
                  <div className="absolute top-2 right-2 text-xs bg-black/40 px-2 py-0.5 rounded-md text-neutral-400 font-mono scale-90">
                    {card.condition}
                  </div>
                  <div className="text-3xl mt-2">🃏</div>
                  <div>
                    <h4 className="font-bold text-sm leading-tight truncate">{card.name}</h4>
                    <p className="text-[11px] text-[#E50914] font-medium mt-0.5">{card.brand}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentTab === 'messages' && (
          <div className="space-y-4 py-2 h-full flex flex-col">
            {!activeChat ? (
              <>
                <div>
                  <h2 className="text-2xl font-black">Trade Proposals</h2>
                  <p className="text-xs text-neutral-500">Mutual swiped matches waiting for offers.</p>
                </div>

                <div className="divide-y divide-neutral-900">
                  {messages.map((chat) => (
                    <div
                      key={chat.id}
                      onClick={() => {
                        setActiveChat(chat);
                        setMessages((prevMessages) =>
                          prevMessages.map((msg) => (msg.id === chat.id ? { ...msg, unread: false } : msg))
                        );
                      }}
                      className="py-4 flex items-center justify-between cursor-pointer group hover:bg-neutral-900/40 px-2 rounded-xl transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center font-bold text-sm text-[#E50914]">
                          {chat.user[0]}
                        </div>
                        <div>
                          <h4 className="font-bold text-sm flex items-center">
                            {chat.user}
                            {chat.unread && <span className="w-1.5 h-1.5 bg-[#E50914] rounded-full ml-2"></span>}
                          </h4>
                          <p className="text-xs text-neutral-500 truncate max-w-[220px] mt-0.5">{chat.lastMsg}</p>
                        </div>
                      </div>
                      <span className="text-xs text-neutral-600">➔</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col h-full space-y-4">
                <div className="flex items-center space-x-3 pb-3 border-b border-neutral-900">
                  <button onClick={() => setActiveChat(null)} className="text-neutral-400 text-sm hover:text-white" type="button">
                    ◀ Back
                  </button>
                  <h3 className="font-bold text-base">Chatting with @{activeChat.user}</h3>
                </div>

                <div className="flex-grow bg-neutral-900/20 rounded-2xl p-4 flex flex-col justify-end space-y-3 min-h-[300px]">
                  <div className="bg-neutral-900 border border-neutral-800 p-3 rounded-2xl rounded-bl-none max-w-[80%] text-xs self-start">
                    {activeChat.lastMsg}
                  </div>
                  <div className="bg-[#E50914] text-white p-3 rounded-2xl rounded-br-none max-w-[80%] text-xs self-end font-medium">
                    Hey! Checked out your binder. Definitely down to figure out a deal.
                  </div>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Type a trade offer..."
                    value={chatDraft}
                    onChange={(e) => setChatDraft(e.target.value)}
                    className="flex-grow p-3 bg-neutral-900 border border-neutral-800 rounded-xl text-xs focus:outline-none"
                  />
                  <button className="bg-[#E50914] px-4 rounded-xl text-xs font-bold" type="button" onClick={handleSendMessage}>
                    Send
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="bg-neutral-900/90 backdrop-blur-md border-t border-neutral-800 py-2 px-4 sticky bottom-0 z-50">
        <nav className="flex justify-around items-center">
          <button
            onClick={() => {
              setCurrentTab('swipe');
              setActiveChat(null);
            }}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'swipe' ? 'text-[#E50914]' : 'text-neutral-500'}`}
            type="button"
          >
            <span className="text-lg mb-0.5">🎴</span>
            <span>Swipe</span>
          </button>

          <button
            onClick={() => {
              setCurrentTab('post');
              setActiveChat(null);
            }}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'post' ? 'text-[#E50914]' : 'text-neutral-500'}`}
            type="button"
          >
            <span className="text-lg mb-0.5">📤</span>
            <span>Post Card</span>
          </button>

          <button
            onClick={() => {
              setCurrentTab('collection');
              setActiveChat(null);
            }}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'collection' ? 'text-[#E50914]' : 'text-neutral-500'}`}
            type="button"
          >
            <span className="text-lg mb-0.5">🗂️</span>
            <span>Binder</span>
          </button>

          <button
            onClick={() => setCurrentTab('messages')}
            className={`flex flex-col items-center p-2 text-xs font-medium transition-colors ${currentTab === 'messages' ? 'text-[#E50914]' : 'text-neutral-500'}`}
            type="button"
          >
            <span className="text-lg mb-0.5">💬</span>
            <span>Inbox</span>
          </button>
        </nav>
      </footer>
    </div>
  );
}
