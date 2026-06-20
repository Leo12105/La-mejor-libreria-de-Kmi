const quotes = [

'"Amar no es mirarse el uno al otro, sino mirar juntos en la misma dirección."',

'"Te quiero para volvernos locos de risa."',

'"Siempre hay algo de locura en el amor."',

'"Eres mi lugar favorito."',

'"Cada página contigo vale más que una biblioteca entera."',

'"Donde reina el amor, sobran las leyes."'

];

document.getElementById("quote").innerText =
quotes[Math.floor(Math.random()*quotes.length)];

const enterBtn =
document.getElementById("enterBtn");

const librarySection =
document.getElementById("librarySection");

enterBtn.addEventListener("click",()=>{

document.querySelector(".hero").style.display="none";

librarySection.style.display="block";

});

const bookInput =
document.getElementById("bookInput");

const bookshelf =
document.getElementById("bookshelf");

let books =
JSON.parse(
localStorage.getItem("books")
) || [];

renderBooks();

bookInput.addEventListener("change",(e)=>{

const file = e.target.files[0];

if(!file) return;

const book = {

id:Date.now(),

name:file.name,

favorite:false

};

books.push(book);

saveBooks();

renderBooks();

});

function saveBooks(){

localStorage.setItem(
"books",
JSON.stringify(books)
);

}

function renderBooks(){

bookshelf.innerHTML="";

books.forEach(book=>{

const card =
document.createElement("div");

card.className="book-card";

card.innerHTML=`

<div class="book-cover">
📖
</div>

<div class="book-title">
${book.name}
</div>

<div class="book-actions">

<button onclick="favoriteBook(${book.id})">
${book.favorite ? "❤️" : "🤍"}
</button>

<button onclick="readBook(${book.id})">
Leer
</button>

<button onclick="deleteBook(${book.id})">
🗑
</button>

</div>

`;

bookshelf.appendChild(card);

});

}

function favoriteBook(id){

books = books.map(book=>{

if(book.id===id){

book.favorite=!book.favorite;

}

return book;

});

saveBooks();

renderBooks();

}

function deleteBook(id){

books = books.filter(
book=>book.id!==id
);

saveBooks();

renderBooks();

}

function readBook(id){

const book =
books.find(b=>b.id===id);

alert(
"Próximamente se abrirá: " +
book.name
);

}
