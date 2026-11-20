# ComunicaNotes — Mini Sistema Web de Anotações e Comunicados WhatsApp

Aplicação web desenvolvida exclusivamente com **HTML5, CSS3 e JavaScript puro (Vanilla JS)**, sem frameworks, bibliotecas externas ou banco de dados.

## Como Executar
1. Mantenha a estrutura de pastas (`index.html`, `css/style.css`, `js/app.js`).
2. Dê um duplo clique no arquivo `index.html` para abri-lo em qualquer navegador moderno (Chrome, Edge, Firefox, Safari).

## Funcionalidades Implementadas
- **CRUD Completo:** Cadastro, edição, visualização e exclusão de anotações e comunicados.
- **Categorias & Destinatários:** Personalização de cores por categoria e lista rápida de contatos/grupos.
- **Integração Oficial WhatsApp:** Geração automática de mensagem formatada e codificada via `api.whatsapp.com/send` (compatível com WhatsApp Web e Mobile).
- **Trava Real de 60 Segundos:** Bloqueio visual e validação via timestamp em JavaScript impedindo confirmação prematura antes de 60 segundos após o envio.
- **Persistência & Backup:** Armazenamento automático em `LocalStorage` com exportação e importação em arquivo `.json`.

## Limitação Técnica da Confirmação de Leitura (Arquitetura Local)
Como este sistema não utiliza servidor backend ou banco de dados na nuvem:
- Todos os registros residem exclusivamente no `LocalStorage` do navegador onde foram criados.
- O link gerado (`?confirmar=ID`) abre a tela de validação local no mesmo navegador/origem. Para que um destinatário em outro celular ou computador confirme remotamente e atualize o painel do remetente em tempo real, seria necessária uma API/banco de dados compartilhado em rede.
