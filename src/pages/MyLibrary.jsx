import { useEffect, useState } from "react";
import axios from "axios";
import { useAuth } from "../context/AuthContext";

const API_BASE = "http://localhost:5000/api";

export default function MyLibrary() {
  const { user, token } = useAuth();
  const [ebooks, setEbooks] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    const fetchLibrary = async () => {
      try {
        const res = await axios.get(`${API_BASE}/purchases/my-library`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        setEbooks(res.data.ebooks || []);
      } catch (err) {
        setMessage("Failed to load library");
      }
    };
    fetchLibrary();
  }, [token]);

  if (!user) {
    return <p>Please login to see your library.</p>;
  }

  return (
    <div className="library-container">
      <h2>{user.name}'s Library</h2>
      {message && <p>{message}</p>}
      {ebooks.length === 0 && <p>No ebooks purchased yet.</p>}

      <div className="ebook-grid">
        {ebooks.map((book) => (
          <div key={book._id} className="ebook-card">
            <h3>{book.title}</h3>
            <p>{book.description}</p>
            {/* existing preview/open logic here */}
            <a href={book.pdfUrl} target="_blank" rel="noreferrer">
              Open PDF
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
