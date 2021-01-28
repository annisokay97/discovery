export default function(discovery) {
    let data = {};

    discovery.page.define('default', {
        view: 'switch',
        content: [
            {
                when: '#.modelfree',
                content: [
                    {
                        view: 'h1',
                        className: 'modelfree',
                        content: [
                            'text:"Discovery "',
                            'badge:{ text: "model free mode" }'
                        ]
                    },
                    'html:"<p>Running in <b>model free mode</b>, because no config or models are set up. Please, read <a class=\\"view-link\\" href=\\"https://github.com/discoveryjs/discovery/blob/master/README.md\\" href=\\"_blank\\">documention</a> for more details."',
                    'html:"<p>Load data (JSON) with a button or just drop a file on the page.</p>"',
                    'html:"<br>"',
                    {
                        view: 'input',
                        className: 'jsonInput',
                        onChange: (e) => data = e,
                    },
                    {
                        view: 'button-primary',
                        onClick: () =>  {
                            const parsedData = typeof data === "string" ? JSON.parse(data) :data;

                            discovery.loadDataFromUrl(parsedData)},
                            content: 'text:"Load data"'
                    }
                ]
            },
            {
                content: [
                    'page-header{ content: "h1:#.name" }',
                    { view: 'struct', expanded: 1 }
                ]
            }
        ]
    });
}
